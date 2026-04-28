import { useEffect, useCallback, useRef } from 'react';
import { useTransferStore, type Transfer, type RecordingType } from '../store/transferStore';
import { usePeerStore } from '../store/peerStore';
import { useSessionStore } from '../store/sessionStore';
import { useTrystero } from '../contexts/TrysteroContext';
import {
  FileTransferProtocol,
  type AckPayload,
  type TransferMetadata
} from '../utils/FileTransferProtocol';
import { TRANSFER_CONFIG } from '../utils/transferConfig';

export interface QueuedTransfer {
  id: string;
  peerId: string;
  peerName: string;
  blob: Blob;
  filename: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress: number;
  error?: string;
}

// Throttle receiver-side progress broadcasts to avoid flooding the network.
const PROGRESS_BROADCAST_INTERVAL_MS = 250;
const PROGRESS_BROADCAST_THRESHOLD = 0.05;

function parseRecordingType(filename: string): RecordingType {
  if (filename.includes('screen-')) {
    return 'screen';
  }
  return 'camera';
}

export function useFileTransfer() {
  const { room, selfId, broadcastTransferStatus } = useTrystero();
  const { transfers, setTransfers, addReceivedRecording, isTransferring } = useTransferStore();
  const { peers } = usePeerStore();
  const { userName } = useSessionStore();
  const initializedRef = useRef(false);

  const queueRef = useRef<QueuedTransfer[]>([]);
  const protocolsRef = useRef<Map<string, FileTransferProtocol>>(new Map());
  const activeCountRef = useRef(0);
  const sendBinaryRef = useRef<
    | ((
        data: Blob,
        peerId: string,
        metadata: TransferMetadata,
        onProgress: (percent: number) => void
      ) => Promise<void>)
    | null
  >(null);
  const sendAckRef = useRef<((data: AckPayload, peerId: string) => void) | null>(null);

  // Per-receive-transfer state: who is sending it to us, what filename, last broadcast time/progress.
  const incomingTransfersRef = useRef<
    Map<
      string,
      {
        peerId: string;
        senderName: string;
        filename: string;
        size: number;
        lastBroadcastTime: number;
        lastBroadcastProgress: number;
      }
    >
  >(new Map());

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTransferring()) {
        e.preventDefault();
        e.returnValue = 'File transfers are in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isTransferring]);

  const updateStoreFromQueue = useCallback(() => {
    const senderName = userName || 'Anonymous';
    const transferList: Transfer[] = queueRef.current.map((q) => ({
      id: q.id,
      peerId: q.peerId,
      peerName: q.peerName,
      filename: q.filename,
      size: q.blob.size,
      progress: q.progress,
      status: q.status,
      error: q.error,
      direction: 'send' as const,
      role: 'sender' as const,
      senderId: selfId,
      senderName: senderName,
      receiverId: q.peerId,
      receiverName: q.peerName
    }));
    setTransfers(transferList);
  }, [setTransfers, selfId, userName]);

  // Sender-side: broadcast only on status changes. Mid-transfer progress is owned
  // by the receiver, who has authoritative truth about how much they actually have.
  const updateQueuedTransfer = useCallback(
    (id: string, updates: Partial<QueuedTransfer>) => {
      const index = queueRef.current.findIndex((t) => t.id === id);
      if (index === -1) return;

      const oldTransfer = queueRef.current[index];
      queueRef.current[index] = { ...oldTransfer, ...updates };
      updateStoreFromQueue();

      if (updates.status && updates.status !== oldTransfer.status) {
        const updated = queueRef.current[index];
        const senderName = userName || 'Anonymous';
        broadcastTransferStatus({
          transferId: updated.id,
          senderId: selfId,
          senderName: senderName,
          receiverId: updated.peerId,
          receiverName: updated.peerName,
          filename: updated.filename,
          size: updated.blob.size,
          progress: updated.progress,
          status: updated.status,
          error: updated.error
        });
      }
    },
    [updateStoreFromQueue, broadcastTransferStatus, selfId, userName]
  );

  const processNext = useCallback(async () => {
    if (activeCountRef.current >= TRANSFER_CONFIG.MAX_PARALLEL_TRANSFERS) return;

    const next = queueRef.current.find((t) => t.status === 'pending');
    if (!next) return;

    const protocol = protocolsRef.current.get(next.peerId);
    if (!protocol) {
      updateQueuedTransfer(next.id, { status: 'error', error: 'Peer not connected' });
      processNext();
      return;
    }

    activeCountRef.current++;
    updateQueuedTransfer(next.id, { status: 'active' });

    try {
      await protocol.sendFile(next.blob, next.filename, next.id, (sent, total) => {
        // Local UI only — no broadcast. Receiver-side progress drives observers.
        const idx = queueRef.current.findIndex((t) => t.id === next.id);
        if (idx !== -1) {
          queueRef.current[idx] = { ...queueRef.current[idx], progress: sent / total };
          updateStoreFromQueue();
        }
      });
      updateQueuedTransfer(next.id, { status: 'complete', progress: 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed';
      updateQueuedTransfer(next.id, { status: 'error', error: message });
    } finally {
      activeCountRef.current--;
      processNext();
    }
  }, [updateQueuedTransfer, updateStoreFromQueue]);

  const addPeer = useCallback(
    (peerId: string) => {
      if (protocolsRef.current.has(peerId)) return;
      if (!sendBinaryRef.current || !sendAckRef.current) return;

      const sendBinary = sendBinaryRef.current;
      const sendAck = sendAckRef.current;
      const protocol = new FileTransferProtocol();

      protocol.initialize(
        (data, metadata, onProgress) => sendBinary(data, peerId, metadata, onProgress),
        (data) => sendAck(data, peerId)
      );

      protocol.setReceiveProgressHandler((transferId, progress) => {
        const incoming = incomingTransfersRef.current.get(transferId);
        if (!incoming) return;

        useTransferStore.getState().updateTransfer(transferId, { progress });

        const now = Date.now();
        const delta = progress - incoming.lastBroadcastProgress;
        if (
          now - incoming.lastBroadcastTime >= PROGRESS_BROADCAST_INTERVAL_MS ||
          delta >= PROGRESS_BROADCAST_THRESHOLD
        ) {
          incoming.lastBroadcastTime = now;
          incoming.lastBroadcastProgress = progress;
          broadcastTransferStatus({
            transferId,
            senderId: incoming.peerId,
            senderName: incoming.senderName,
            receiverId: selfId,
            receiverName: useSessionStore.getState().userName || 'Anonymous',
            filename: incoming.filename,
            size: incoming.size,
            progress,
            status: 'active'
          });
        }
      });

      protocol.setCompleteHandler((transferId, blob, filename) => {
        const incoming = incomingTransfersRef.current.get(transferId);
        incomingTransfersRef.current.delete(transferId);

        useTransferStore.getState().updateTransfer(transferId, { progress: 1, status: 'complete' });

        if (incoming) {
          broadcastTransferStatus({
            transferId,
            senderId: incoming.peerId,
            senderName: incoming.senderName,
            receiverId: selfId,
            receiverName: useSessionStore.getState().userName || 'Anonymous',
            filename: incoming.filename,
            size: incoming.size,
            progress: 1,
            status: 'complete'
          });
        }

        const currentPeers = usePeerStore.getState().peers;
        const peer = currentPeers.find((p) => p.id === peerId);
        const recordingType = parseRecordingType(filename || '');
        addReceivedRecording({
          peerId,
          peerName: peer?.name || `User-${peerId.slice(0, 4)}`,
          blob,
          receivedAt: Date.now(),
          type: recordingType
        });
      });

      protocol.setErrorHandler((transferId, error) => {
        const idx = queueRef.current.findIndex((t) => t.id === transferId);
        if (idx !== -1) {
          updateQueuedTransfer(transferId, { status: 'error', error });
        } else {
          useTransferStore.getState().updateTransfer(transferId, { status: 'error', error });
        }
      });

      protocolsRef.current.set(peerId, protocol);
    },
    [addReceivedRecording, updateQueuedTransfer, broadcastTransferStatus, selfId]
  );

  const removePeer = useCallback((peerId: string) => {
    const protocol = protocolsRef.current.get(peerId);
    protocol?.clear();
    protocolsRef.current.delete(peerId);
  }, []);

  useEffect(() => {
    if (room && !initializedRef.current) {
      initializedRef.current = true;

      const [sendXfer, onXfer, onXferProgress] = room.makeAction<ArrayBuffer>('xfer');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sendXferAck, onXferAck] = room.makeAction<any>('xfer-ack');

      sendBinaryRef.current = (data, peerId, metadata, onProgress) =>
        sendXfer(data, peerId, metadata, (percent) => onProgress(percent)).then(() => undefined);
      sendAckRef.current = (data, peerId) => sendXferAck(data, peerId);

      onXfer((data: ArrayBuffer, peerId: string, metadata?: unknown) => {
        const protocol = protocolsRef.current.get(peerId);
        if (!protocol) return;
        const meta = metadata as TransferMetadata | undefined;
        if (!meta || !meta.transferId) return;
        protocol.handleReceivedFile(data, meta);
      });

      // Trystero fires this per-fragment as the binary streams in. The first
      // fragment carries the metadata payload; we lazily register receive-side
      // tracking on first sight so we can broadcast host-side progress.
      onXferProgress((percent: number, peerId: string, metadata?: unknown) => {
        const meta = metadata as TransferMetadata | undefined;
        if (!meta || !meta.transferId) return;

        if (!incomingTransfersRef.current.has(meta.transferId)) {
          const peerEntry = usePeerStore.getState().peers.find((p) => p.id === peerId);
          const senderName = peerEntry?.name || `User-${peerId.slice(0, 4)}`;
          incomingTransfersRef.current.set(meta.transferId, {
            peerId,
            senderName,
            filename: meta.filename,
            size: meta.size,
            lastBroadcastTime: 0,
            lastBroadcastProgress: 0
          });
        }

        const protocol = protocolsRef.current.get(peerId);
        protocol?.handleReceiveProgress(meta.transferId, percent, meta.size);
      });

      onXferAck((data: unknown, peerId: string) => {
        if (typeof data !== 'object' || data === null) return;
        const ack = data as AckPayload;
        const protocol = protocolsRef.current.get(peerId);
        protocol?.handleAck(ack);
      });

      const existingPeers = room.getPeers();
      Object.keys(existingPeers).forEach((peerId) => {
        addPeer(peerId);
      });
    }

    const protocols = protocolsRef.current;
    const incomingTransfers = incomingTransfersRef.current;
    return () => {
      if (initializedRef.current) {
        protocols.forEach((p) => p.clear());
        protocols.clear();
        queueRef.current = [];
        incomingTransfers.clear();
        activeCountRef.current = 0;
        sendBinaryRef.current = null;
        sendAckRef.current = null;
        initializedRef.current = false;
      }
    };
  }, [room, addPeer]);

  useEffect(() => {
    if (!room || !initializedRef.current) return;

    peers.forEach((peer) => {
      if (!protocolsRef.current.has(peer.id)) {
        addPeer(peer.id);
      }
    });

    const currentPeerIds = new Set(peers.map((p) => p.id));
    protocolsRef.current.forEach((_, peerId) => {
      if (!currentPeerIds.has(peerId)) {
        removePeer(peerId);
      }
    });
  }, [room, peers, addPeer, removePeer]);

  const enqueue = useCallback(
    (peerId: string, peerName: string, blob: Blob, filename: string): string => {
      const id = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const senderName = userName || 'Anonymous';

      queueRef.current.push({
        id,
        peerId,
        peerName,
        blob,
        filename,
        status: 'pending',
        progress: 0
      });

      updateStoreFromQueue();

      broadcastTransferStatus({
        transferId: id,
        senderId: selfId,
        senderName: senderName,
        receiverId: peerId,
        receiverName: peerName,
        filename: filename,
        size: blob.size,
        progress: 0,
        status: 'pending'
      });

      processNext();

      return id;
    },
    [updateStoreFromQueue, processNext, broadcastTransferStatus, selfId, userName]
  );

  const sendRecording = useCallback(
    (peerId: string, blob: Blob, filename: string) => {
      const peer = peers.find((p) => p.id === peerId);
      const peerName = peer?.name || `User-${peerId.slice(0, 4)}`;
      return enqueue(peerId, peerName, blob, filename);
    },
    [peers, enqueue]
  );

  const sendToAllPeers = useCallback(
    (blob: Blob, filename: string) => {
      const ids: string[] = [];
      for (const peer of peers) {
        const id = enqueue(peer.id, peer.name, blob, filename);
        ids.push(id);
      }
      return ids;
    },
    [peers, enqueue]
  );

  const sendMultipleToAllPeers = useCallback(
    (recordings: Array<{ blob: Blob; type: RecordingType }>) => {
      const ids: string[] = [];
      for (const peer of peers) {
        for (const recording of recordings) {
          const filename = `${recording.type}-recording-${Date.now()}.webm`;
          const id = enqueue(peer.id, peer.name, recording.blob, filename);
          ids.push(id);
        }
      }
      return ids;
    },
    [peers, enqueue]
  );

  const clearCompleted = useCallback(() => {
    queueRef.current = queueRef.current.filter(
      (t) => t.status === 'pending' || t.status === 'active'
    );
    updateStoreFromQueue();
  }, [updateStoreFromQueue]);

  return {
    transfers,
    sendRecording,
    sendToAllPeers,
    sendMultipleToAllPeers,
    isTransferring: isTransferring(),
    clearCompleted
  };
}
