import { useState, useRef, useEffect } from 'react';
import { buildJoinUrl, HOST_URL } from '../../utils/urlParams';
import { parseRoomCode } from '../../utils/roomCode';
import { usePopoverStore } from '../../store/popoverStore';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

interface ShareLinkProps {
  sessionId: string;
}

type CopyKind = 'with-password' | 'room-only';

export function ShareLink({ sessionId }: ShareLinkProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { activePopover, togglePopover, closePopover } = usePopoverStore();
  const isOpen = activePopover === 'share';
  const { shouldRender, isExiting } = useDelayedUnmount(isOpen);

  const [copied, setCopied] = useState<CopyKind | null>(null);

  const { roomId, password } = parseRoomCode(sessionId);
  const fullShareUrl = buildJoinUrl(HOST_URL, sessionId);
  const roomOnlyUrl = buildJoinUrl(HOST_URL, sessionId, { includePassword: false });

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

  const copy = async (text: string, kind: CopyKind) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const showCopied = copied !== null;

  return (
    <>
      <div
        ref={buttonRef}
        data-testid="share-link-button"
        data-copied={showCopied ? 'true' : 'false'}
        className={`flex items-stretch rounded-md text-xs font-medium overflow-hidden max-w-[18rem] ${
          showCopied ? 'bg-green-500 text-white' : isOpen ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'
        }`}
      >
        <button
          onClick={() => copy(fullShareUrl, 'with-password')}
          data-testid="share-link-copy-button"
          aria-label={`Copy share link for ${roomId}`}
          title={showCopied ? 'Copied!' : `Copy: ${fullShareUrl}`}
          className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${
            showCopied ? 'bg-green-500 hover:bg-green-600' : 'hover:bg-gray-700'
          }`}
        >
          {showCopied ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-[11px]">Copied!</span>
            </>
          ) : (
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          )}
        </button>
        <button
          onClick={() => togglePopover('share')}
          data-testid="share-link-name-button"
          aria-label={`Share details for ${roomId}`}
          aria-expanded={isOpen}
          title="Share details"
          className={`flex items-center px-2 py-1 cursor-pointer truncate font-mono border-l transition-colors ${
            showCopied
              ? 'border-green-600 hover:bg-green-600'
              : 'border-gray-700 hover:bg-gray-700'
          }`}
        >
          <span className="truncate">{roomId}</span>
        </button>
      </div>

      {shouldRender && (
        <div
          ref={popoverRef}
          data-testid="share-link-popover"
          className={`absolute right-2 top-full mt-1 w-80 border rounded-xl shadow-2xl z-50 backdrop-blur-xl bg-gray-950/95 border-gray-700/50 ${
            isExiting ? 'popover-exit' : 'popover-enter'
          }`}
        >
          <div className="px-4 py-3 border-b border-gray-700/50">
            <h3 className="text-sm font-bold text-gray-100 tracking-wide">Share room</h3>
            <p className="text-[10px] text-gray-400">
              Send the link to invite participants.
            </p>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Room name
              </div>
              <div
                data-testid="share-link-room-name"
                className="font-mono text-sm text-gray-100 break-all select-all"
              >
                {roomId}
              </div>
            </div>

            {password && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                  Password
                </div>
                <div
                  data-testid="share-link-password"
                  className="font-mono text-sm text-gray-100 break-all select-all"
                >
                  {password}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Link</div>
              <div className="font-mono text-[11px] text-gray-300 break-all bg-gray-900/60 border border-gray-700/50 rounded-md px-2 py-1.5 select-all">
                {fullShareUrl}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={() => copy(fullShareUrl, 'with-password')}
                data-testid="share-link-copy-with-password"
                className={`w-full px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  copied === 'with-password'
                    ? 'bg-green-500 text-white'
                    : 'bg-[--color-primary]/20 hover:bg-[--color-primary]/30 text-[--color-primary]'
                }`}
              >
                {copied === 'with-password' ? 'Copied!' : 'Copy link with password'}
              </button>
              <button
                onClick={() => copy(roomOnlyUrl, 'room-only')}
                data-testid="share-link-copy-room-only"
                className={`w-full px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  copied === 'room-only'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                }`}
              >
                {copied === 'room-only' ? 'Copied!' : 'Copy room-only link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
