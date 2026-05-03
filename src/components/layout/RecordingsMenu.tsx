import { useRef, useEffect, useState, useCallback } from 'react';
import { useNLEStore } from '../../store/nleStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useTransferStore } from '../../store/transferStore';
import { usePopoverStore } from '../../store/popoverStore';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { discardRecordingSession } from '../../utils/discardRecording';
import { RacerRow } from '../transfer/RacerRow';
import { formatBytes, useTransferRacers } from '../transfer/transferRacers';

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatStartedAt(ts: number | null): string {
  if (ts === null) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function RecordingsMenu() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { activePopover, togglePopover, closePopover } = usePopoverStore();
  const { clips, totalDuration, setMode } = useNLEStore();
  const { localBlob, startTime, isRecording } = useRecordingStore();
  const { transfers } = useTransferStore();

  const isOpen = activePopover === 'recordings';
  const { shouldRender, isExiting } = useDelayedUnmount(isOpen);

  // Auto-open the popover the first time transfers appear (replaces TransferIndicator's auto-open).
  const prevTransferCountRef = useRef(0);
  useEffect(() => {
    if (prevTransferCountRef.current === 0 && transfers.length > 0) {
      usePopoverStore.getState().openPopover('recordings');
    }
    prevTransferCountRef.current = transfers.length;
  }, [transfers.length]);

  // Live-tick the recording timer once a second so the button label updates.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRecording || startTime === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRecording, startTime]);

  const elapsedMs = isRecording && startTime !== null ? Math.max(0, now - startTime) : 0;

  const hasSession = !isRecording && (clips.length > 0 || localBlob !== null);

  const racers = useTransferRacers();
  const activeTransfers = transfers.filter(
    (t) => t.status === 'active' || t.status === 'pending'
  );
  const completedTransfers = transfers.filter((t) => t.status === 'complete');
  const isTransferActive = activeTransfers.length > 0;
  const allTransfersComplete =
    transfers.length > 0 && completedTransfers.length === transfers.length;
  const totalProgress =
    transfers.length > 0
      ? transfers.reduce((acc, t) => acc + t.progress, 0) / transfers.length
      : 0;
  const totalSize = transfers.reduce((acc, t) => acc + t.size, 0);
  const transferredSize = transfers.reduce((acc, t) => acc + t.size * t.progress, 0);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        closePopover();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closePopover]);

  const handleOpenEditor = useCallback(() => {
    setMode('editing');
    closePopover();
  }, [setMode, closePopover]);

  const handleDiscard = useCallback(() => {
    if (!window.confirm('Discard this recording? This cannot be undone.')) return;
    discardRecordingSession();
    closePopover();
  }, [closePopover]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => togglePopover('recordings')}
        data-testid={isRecording ? 'rec-indicator' : 'recordings-menu-button'}
        aria-label={
          isRecording
            ? 'Recording in progress'
            : isTransferActive
              ? 'File transfers'
              : 'Recordings'
        }
        aria-expanded={isOpen}
        title={isRecording ? 'Recording in progress' : 'Recordings'}
        className={`
          relative flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer
          ${
            isRecording
              ? 'bg-red-500 text-white hover:bg-red-600'
              : isOpen
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }
        `}
      >
        {isRecording ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span>REC</span>
            <span className="font-mono tabular-nums">{formatDuration(elapsedMs)}</span>
          </>
        ) : isTransferActive ? (
          <>
            <span className="font-mono tabular-nums">
              {String(Math.round(totalProgress * 100)).padStart(2, '0')}%
            </span>
            <span className="text-[10px] opacity-60 font-mono tabular-nums">
              {formatBytes(transferredSize)}/{formatBytes(totalSize)}
            </span>
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-md overflow-hidden bg-white/20"
              aria-hidden="true"
            >
              <span
                className="block h-full bg-[--color-primary] transition-all duration-300 ease-out"
                style={{ width: `${totalProgress * 100}%` }}
              />
            </span>
          </>
        ) : allTransfersComplete ? (
          <>
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Done</span>
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
            </svg>
            Recordings
            {hasSession && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[--color-primary]/20 text-[--color-primary] text-[10px] px-1.5 py-0.5 font-mono">
                1
              </span>
            )}
          </>
        )}
      </button>

      {shouldRender && (
        <div
          ref={popoverRef}
          data-testid="recordings-menu-popover"
          className={`absolute right-2 top-full mt-1 w-80 border rounded-xl shadow-2xl z-50 backdrop-blur-xl bg-gray-950/95 border-gray-700/50 ${
            isExiting ? 'popover-exit' : 'popover-enter'
          }`}
        >
          <div className="px-4 py-3 border-b border-gray-700/50">
            <h3 className="text-sm font-bold text-gray-100 tracking-wide">Recordings</h3>
            <p className="text-[10px] text-gray-400">
              {isRecording
                ? 'Recording in progress.'
                : isTransferActive
                  ? 'Receiving files from participants.'
                  : 'Reopen the editor or discard this session.'}
            </p>
          </div>

          <div className="p-3 space-y-3 max-h-[28rem] overflow-y-auto no-scrollbar">
            {isRecording && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-200">Recording…</div>
                  <div className="text-[11px] text-red-200/70 mt-0.5">
                    Started {formatStartedAt(startTime)}
                  </div>
                </div>
                <div className="text-sm font-mono tabular-nums text-red-200">
                  {formatDuration(elapsedMs)}
                </div>
              </div>
            )}

            {transfers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] uppercase tracking-wide text-gray-400">
                    File transfers
                  </h4>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      allTransfersComplete
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-[--color-primary]/20 text-[--color-primary]'
                    }`}
                  >
                    {completedTransfers.length}/{transfers.length}
                  </span>
                </div>
                {racers.map((racer, index) => (
                  <RacerRow key={racer.id} racer={racer} position={index + 1} />
                ))}
              </div>
            )}

            {hasSession && (
              <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-gray-100">Current recording</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {formatStartedAt(startTime)} · {formatDuration(totalDuration)} ·{' '}
                      {clips.length} clip{clips.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenEditor}
                    data-testid="recordings-menu-open-editor"
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-[--color-primary]/20 hover:bg-[--color-primary]/30 text-[--color-primary] rounded-md cursor-pointer transition-colors"
                  >
                    Open Editor
                  </button>
                  <button
                    onClick={handleDiscard}
                    data-testid="recordings-menu-discard"
                    className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md cursor-pointer transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {!isRecording && transfers.length === 0 && !hasSession && (
              <div className="text-center py-6 text-xs text-gray-500">No recordings yet.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
