import { TRANSFER_CONFIG } from './transferConfig';

export interface TransferMetadata {
  transferId: string;
  filename: string;
  size: number;
  mimeType: string;
  hash: string;
}

export interface AckPayload {
  transferId: string;
  ok: boolean;
  error?: string;
}

type SendBinaryFn = (
  data: Blob,
  metadata: TransferMetadata,
  onProgress: (percent: number) => void
) => Promise<void>;

type SendAckFn = (data: AckPayload) => void;

type SendProgressCallback = (sent: number, total: number) => void;
type ReceiveProgressCallback = (transferId: string, progress: number, size: number) => void;
type CompleteCallback = (transferId: string, blob: Blob, filename: string) => void;
type ErrorCallback = (transferId: string, error: string) => void;

export class FileTransferProtocol {
  private sendBinary: SendBinaryFn | null = null;
  private sendAck: SendAckFn | null = null;

  private onReceiveProgress: ReceiveProgressCallback | null = null;
  private onComplete: CompleteCallback | null = null;
  private onError: ErrorCallback | null = null;

  private pendingSends = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  initialize(sendBinary: SendBinaryFn, sendAck: SendAckFn): void {
    this.sendBinary = sendBinary;
    this.sendAck = sendAck;
  }

  setReceiveProgressHandler(cb: ReceiveProgressCallback): void {
    this.onReceiveProgress = cb;
  }

  setCompleteHandler(cb: CompleteCallback): void {
    this.onComplete = cb;
  }

  setErrorHandler(cb: ErrorCallback): void {
    this.onError = cb;
  }

  async sendFile(
    blob: Blob,
    filename: string,
    transferId: string,
    onProgress?: SendProgressCallback
  ): Promise<void> {
    if (!this.sendBinary) throw new Error('Protocol not initialized');

    const hash = await computeHash(blob);
    const metadata: TransferMetadata = {
      transferId,
      filename,
      size: blob.size,
      mimeType: blob.type || 'video/webm',
      hash
    };

    await this.sendBinary(blob, metadata, (percent) => {
      onProgress?.(Math.round(percent * blob.size), blob.size);
    });

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSends.delete(transferId);
        reject(new Error('Receiver ACK timeout'));
      }, TRANSFER_CONFIG.ACK_TIMEOUT);

      this.pendingSends.set(transferId, { resolve, reject, timer });
    });
  }

  handleReceivedFile(buffer: ArrayBuffer, metadata: TransferMetadata): void {
    if (!this.sendAck) return;

    const blob = new Blob([buffer], { type: metadata.mimeType });

    // ACK before hashing — DCs are reliable+ordered, so corruption is rare.
    // We verify in the background and surface a non-fatal error on mismatch.
    this.sendAck({ transferId: metadata.transferId, ok: true });
    this.onComplete?.(metadata.transferId, blob, metadata.filename);

    void computeHash(blob).then((hash) => {
      if (hash !== metadata.hash) {
        this.onError?.(metadata.transferId, 'Hash mismatch — transfer may be corrupt');
      }
    });
  }

  handleReceiveProgress(transferId: string, percent: number, size: number): void {
    this.onReceiveProgress?.(transferId, percent, size);
  }

  handleAck(ack: AckPayload): void {
    const pending = this.pendingSends.get(ack.transferId);
    if (!pending) return;
    this.pendingSends.delete(ack.transferId);
    clearTimeout(pending.timer);
    if (ack.ok) {
      pending.resolve();
    } else {
      pending.reject(new Error(ack.error || 'Receiver reported error'));
    }
  }

  clear(): void {
    this.pendingSends.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error('Protocol cleared'));
    });
    this.pendingSends.clear();
    this.sendBinary = null;
    this.sendAck = null;
    this.onReceiveProgress = null;
    this.onComplete = null;
    this.onError = null;
  }
}

async function computeHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
