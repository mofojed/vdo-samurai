import { type ReactNode } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { usePeerStore } from '../../store/peerStore';
import { VideoElement } from './VideoElement';

interface MainDisplayProps {
  children?: ReactNode;
}

export function MainDisplay({ children }: MainDisplayProps) {
  const { focusedPeerId, localStream, localScreenStream } = useSessionStore();
  const { peers } = usePeerStore();

  const focusedPeer = peers.find((p) => p.id === focusedPeerId);

  // Debug: log which streams are available
  const focusedPeerHasStream = focusedPeer?.stream !== null;
  const focusedPeerHasScreenStream = focusedPeer?.screenStream !== null;
  console.log(
    '[MainDisplay] localStream:',
    !!localStream,
    'localScreenStream:',
    !!localScreenStream,
    'focusedPeerId:',
    focusedPeerId,
    'focusedPeer.stream:',
    focusedPeerHasStream,
    'focusedPeer.screenStream:',
    focusedPeerHasScreenStream
  );

  // Determine which stream to show
  let displayStream: MediaStream | null = null;
  let displayName = 'You';
  let isScreenShare = false;

  if (focusedPeer) {
    displayStream = focusedPeer.screenStream || focusedPeer.stream;
    displayName = focusedPeer.name;
    isScreenShare = focusedPeer.screenStream !== null;
  } else {
    displayStream = localScreenStream || localStream;
    isScreenShare = localScreenStream !== null;
  }

  // Debug: log stream info
  const displayStreamInfo = displayStream
    ? {
        id: displayStream.id,
        active: displayStream.active,
        videoTracks: displayStream.getVideoTracks().length,
        videoEnabled: displayStream.getVideoTracks()[0]?.enabled,
        videoMuted: displayStream.getVideoTracks()[0]?.muted,
        videoReadyState: displayStream.getVideoTracks()[0]?.readyState
      }
    : null;
  console.log(
    '[MainDisplay] displayStream:',
    !!displayStream,
    'displayName:',
    displayName,
    'isScreenShare:',
    isScreenShare,
    'streamInfo:',
    JSON.stringify(displayStreamInfo)
  );

  return (
    <div
      className="video-cell relative bg-black"
      role="region"
      aria-label={`Main video display showing ${displayName}${isScreenShare ? ' screen share' : ''}`}
    >
      {displayStream ? (
        <>
          <VideoElement stream={displayStream} muted={!focusedPeer} className="w-full h-full" />
          {/* Controls anchored to video */}
          <div
            style={
              {
                position: 'absolute',
                positionAnchor: '--video-anchor',
                bottom: 'anchor(bottom)',
                left: 'anchor(center)',
                transform: 'translate(-50%, -0.5rem)'
              } as React.CSSProperties
            }
          >
            {children}
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="text-center px-4">
            <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center text-2xl sm:text-4xl font-bold text-gray-500">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <p className="text-base sm:text-lg">{displayName}</p>
            <p className="text-xs sm:text-sm text-gray-600">No video</p>
          </div>
        </div>
      )}
    </div>
  );
}
