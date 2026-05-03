import { useRef, useEffect } from 'react';
import { useTransferStore } from '../../store/transferStore';
import { usePopoverStore } from '../../store/popoverStore';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { RacerRow } from './RacerRow';
import { useTransferRacers } from './transferRacers';

interface TransferRacePopoverProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export function TransferRacePopover({ anchorRef }: TransferRacePopoverProps) {
  const { transfers } = useTransferStore();
  const { activePopover, closePopover } = usePopoverStore();
  const popoverRef = useRef<HTMLDivElement>(null);

  const isOpen = activePopover === 'transfer';
  const { shouldRender, isExiting } = useDelayedUnmount(isOpen);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        closePopover();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, closePopover, anchorRef]);

  const racers = useTransferRacers();

  if (!shouldRender) return null;

  const totalFiles = transfers.length;
  const completedFiles = transfers.filter((t) => t.status === 'complete').length;
  const allComplete = completedFiles === totalFiles && totalFiles > 0;

  return (
    <div
      ref={popoverRef}
      className={`
        absolute right-2 top-full mt-1 w-80
        border rounded-xl shadow-2xl z-50
        ${isExiting ? 'popover-exit' : 'popover-enter'}
        bg-gray-950/95 border-gray-700/50 backdrop-blur-xl
      `}
    >
      <div className="relative px-4 py-3 border-b border-gray-700/50 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <pattern id="header-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
            <rect
              width="100%"
              height="100%"
              fill="url(#header-pattern)"
              className="text-[--color-primary]"
            />
          </svg>
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[--color-primary]/10 border border-[--color-primary]/30 flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-[--color-primary]"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5L18 8v8l-6 3.5L6 16V8l6-3.5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100 tracking-wide">File transfer</h3>
              <p className="text-[10px] text-gray-400">
                Keep browser open until your transfer completes.
              </p>
            </div>
          </div>
          <div
            className={`text-xs font-mono px-2 py-1 rounded-full ${
              allComplete
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-[--color-primary]/20 text-[--color-primary]'
            }`}
          >
            {completedFiles}/{totalFiles}
          </div>
        </div>
      </div>

      {racers.find((r) => r.isYou && r.status === 'finished') && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-2 text-emerald-400">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">Your transfer is complete!</span>
          </div>
          <p className="mt-1 text-xs text-emerald-400/70">It is now safe to close this window.</p>
        </div>
      )}

      <div className="p-3 space-y-4 max-h-80 overflow-y-auto no-scrollbar">
        {racers.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">No active transfers</div>
        ) : (
          racers.map((racer, index) => (
            <RacerRow key={racer.id} racer={racer} position={index + 1} />
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-700/50 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {allComplete ? '🎌 All transfers complete!' : '⚔️ Battle in progress...'}
        </span>
        {import.meta.env.DEV && (
          <button
            onClick={() => useTransferStore.getState().simulateRace(5000)}
            className="text-[10px] text-orange-400/70 hover:text-orange-400 transition-colors cursor-pointer"
          >
            Simulate
          </button>
        )}
      </div>
    </div>
  );
}
