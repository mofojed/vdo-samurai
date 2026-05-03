import { useMemo } from 'react';
import { useTransferStore } from '../../store/transferStore';
import { useUserStore } from '../../store/userStore';

export interface RacerData {
  id: string;
  name: string;
  isYou: boolean;
  progress: number;
  status: 'idle' | 'racing' | 'finished' | 'error';
  totalSize: number;
  transferredSize: number;
  fileCount: number;
  completedCount: number;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '00.0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i)).toFixed(1);
  return value.padStart(4, '0') + ' ' + sizes[i];
}

/**
 * Group transfers by sender into racer rows, sorted with "you" first then by progress.
 */
export function useTransferRacers(): RacerData[] {
  const { transfers } = useTransferStore();
  const { profile } = useUserStore();

  return useMemo(() => {
    const racerMap = new Map<string, RacerData>();

    transfers.forEach((transfer) => {
      const isYou = transfer.role === 'sender';
      const racerId = transfer.senderId;
      const racerName = isYou ? profile?.displayName || 'You' : transfer.senderName;

      if (!racerMap.has(racerId)) {
        racerMap.set(racerId, {
          id: racerId,
          name: racerName,
          isYou,
          progress: 0,
          status: 'idle',
          totalSize: 0,
          transferredSize: 0,
          fileCount: 0,
          completedCount: 0
        });
      }

      const racer = racerMap.get(racerId)!;
      racer.fileCount++;
      racer.totalSize += transfer.size;
      racer.transferredSize += transfer.size * transfer.progress;

      if (transfer.status === 'complete') racer.completedCount++;
      if (transfer.status === 'active' || transfer.status === 'pending') racer.status = 'racing';
      if (transfer.status === 'error') racer.status = 'error';
    });

    racerMap.forEach((racer) => {
      racer.progress = racer.totalSize > 0 ? racer.transferredSize / racer.totalSize : 0;
      if (racer.completedCount === racer.fileCount && racer.fileCount > 0) {
        racer.status = 'finished';
        racer.progress = 1;
      }
    });

    return Array.from(racerMap.values()).sort((a, b) => {
      if (a.isYou) return -1;
      if (b.isYou) return 1;
      return b.progress - a.progress;
    });
  }, [transfers, profile]);
}
