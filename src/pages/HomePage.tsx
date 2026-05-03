import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaStream } from '../hooks/useMediaStream';
import { useUserStore } from '../store/userStore';
import { CherryBlossomButton } from '../components/ui/CherryBlossomButton';
import { PendingTransferBanner } from '../components/PendingTransferBanner';
import { usePendingTransfers } from '../hooks/usePendingTransfers';
import { formatRoomCode, parseRoomCode } from '../utils/roomCode';
import { isBrowser } from '../utils/platform';
import {
  getRoomAndPasswordFromUrl,
  clearRoomFromUrl,
  setAutoJoinIntent,
  getAutoJoinIntent,
  clearAutoJoinIntent
} from '../utils/urlParams';

const DEBUG_ROOM_CODE = formatRoomCode('debug_room', 'debug_password');
const BG_IMAGE_URL = './samurai-bg.jpg';

/**
 * Accept input that may be a full share URL or a combined "room?p=password" string,
 * and split it into separate room/password fields.
 */
function splitRoomInput(input: string): { roomId: string; password: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const room = url.searchParams.get('room');
      const password = url.searchParams.get('p');
      if (room) return { roomId: room, password: password ?? '' };
    } catch {
      // fall through
    }
  }

  if (trimmed.includes('?p=')) {
    const parsed = parseRoomCode(trimmed);
    return { roomId: parsed.roomId, password: parsed.password };
  }

  return null;
}

export function HomePage() {
  const [roomId, setRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [hasAutoJoinIntent, setHasAutoJoinIntent] = useState(false);
  const navigate = useNavigate();
  const { createSession, joinSession } = useWebRTC();
  const { requestStream } = useMediaStream();
  const { profile } = useUserStore();

  // Pending transfers (browser only)
  const { pendingTransfers, hasPendingTransfers, downloadPendingTransfer, removePendingTransfer } =
    usePendingTransfers();

  const browserMode = isBrowser();

  // Pre-fill from URL (?room=…&p=…) on mount
  useEffect(() => {
    const fromUrl = getRoomAndPasswordFromUrl();
    if (fromUrl) {
      setRoomId(fromUrl.roomId);
      setRoomPassword(fromUrl.password ?? '');
      const combined = fromUrl.password
        ? formatRoomCode(fromUrl.roomId, fromUrl.password)
        : fromUrl.roomId;
      setAutoJoinIntent(combined);
      setHasAutoJoinIntent(true);
      clearRoomFromUrl();
    }
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = BG_IMAGE_URL;
  }, []);

  const performJoin = useCallback(
    async (room: string, password: string) => {
      const trimmedRoom = room.trim();
      if (!trimmedRoom || !profile?.displayName) return;

      setIsJoining(true);
      try {
        const trimmedPassword = password.trim();
        const sessionCode = trimmedPassword
          ? formatRoomCode(trimmedRoom, trimmedPassword)
          : trimmedRoom;

        await requestStream();
        await joinSession(sessionCode, profile.displayName);
        navigate(`/session/${encodeURIComponent(sessionCode)}`);
      } catch (err) {
        console.error('Failed to join session:', err);
      } finally {
        setIsJoining(false);
      }
    },
    [profile?.displayName, requestStream, joinSession, navigate]
  );

  // Auto-join when profile is ready and there's a pending auto-join intent (from a shared link).
  useEffect(() => {
    const autoJoinCode = getAutoJoinIntent();
    if (autoJoinCode && profile?.displayName && !isJoining && !isCreating) {
      clearAutoJoinIntent();
      const parsed = parseRoomCode(autoJoinCode);
      performJoin(parsed.roomId, parsed.password);
    }
  }, [profile?.displayName, isJoining, isCreating, performJoin]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performJoin(roomId, roomPassword);
  };

  const handleRoomChange = (value: string) => {
    const split = splitRoomInput(value);
    if (split) {
      setRoomId(split.roomId);
      setRoomPassword(split.password);
    } else {
      setRoomId(value);
    }
  };

  const handleCreate = async () => {
    if (!profile?.displayName) return;

    setIsCreating(true);
    try {
      await requestStream();
      const newSessionId = await createSession(profile.displayName);
      navigate(`/session/${encodeURIComponent(newSessionId)}`);
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateDebugRoom = async () => {
    if (!profile?.displayName) return;

    setIsCreating(true);
    try {
      await requestStream();
      await createSession(profile.displayName, DEBUG_ROOM_CODE);
      navigate(`/session/${encodeURIComponent(DEBUG_ROOM_CODE)}`);
    } catch (err) {
      console.error('Failed to create debug session:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleReconnect = (sessionCode: string) => {
    const parsed = parseRoomCode(sessionCode);
    setRoomId(parsed.roomId);
    setRoomPassword(parsed.password);
  };

  return (
    <div
      className={`min-h-screen w-full bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center bg-fade-in ${bgLoaded ? 'loaded' : ''}`}
      style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
    >
      <div className="flex flex-col items-center p-8 border border-white/30 rounded-xl bg-white/20 backdrop-blur-xl shadow-lg w-full max-w-sm">
        <h1 className="text-3xl font-bold text-black mb-2">VDO Samurai</h1>

        {browserMode && (
          <p className="text-xs text-gray-600 mb-4 text-center">Browser Participant Mode</p>
        )}

        {browserMode && hasPendingTransfers && (
          <PendingTransferBanner
            transfers={pendingTransfers}
            onReconnect={handleReconnect}
            onDownload={downloadPendingTransfer}
            onDismiss={removePendingTransfer}
          />
        )}

        {/* Create Room (Electron only) */}
        {!browserMode && (
          <>
            <CherryBlossomButton
              onClick={handleCreate}
              disabled={isCreating || isJoining}
              className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </CherryBlossomButton>

            {import.meta.env.DEV && (
              <button
                onClick={handleCreateDebugRoom}
                disabled={isCreating}
                className="w-full mt-2 px-4 py-2 bg-yellow-500/50 text-black border border-yellow-600 rounded-lg font-medium hover:bg-yellow-500/70 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors text-sm"
              >
                Create Debug Room
              </button>
            )}

            <div className="flex items-center w-full my-6">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="px-4 text-gray-500 text-sm">or</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>
          </>
        )}

        {/* Join Existing Room */}
        <form onSubmit={handleJoin} className="w-full">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            {browserMode ? 'Join Room' : 'Join Existing Room'}
          </h2>

          <label htmlFor="room-code" className="block text-xs font-medium text-gray-700 mb-1">
            Room
          </label>
          <input
            id="room-code"
            data-testid="room-id-input"
            type="text"
            value={roomId}
            onChange={(e) => handleRoomChange(e.target.value)}
            placeholder="Room name or paste link"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white/50 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
          />

          <label
            htmlFor="room-password"
            className="block text-xs font-medium text-gray-700 mb-1 mt-3"
          >
            Password <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            id="room-password"
            data-testid="room-password-input"
            type="text"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            placeholder="Leave blank if shared without password"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white/50 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
          />

          <CherryBlossomButton
            type="submit"
            disabled={isJoining || isCreating || !roomId.trim()}
            containerClassName="mt-4"
            className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {isJoining || hasAutoJoinIntent ? 'Joining...' : 'Join Room'}
          </CherryBlossomButton>
        </form>

        {browserMode && (
          <p className="mt-6 text-xs text-gray-500 text-center">
            To host a session, download the{' '}
            <a
              href="https://github.com/dsmmcken/vdo-samurai/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              desktop app
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
