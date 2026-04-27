import { type ReactNode, useMemo } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { usePeerStore } from '../../store/peerStore';
import { useUserStore } from '../../store/userStore';
import { VideoElement } from './VideoElement';

interface MainDisplayProps {
  children?: ReactNode;
}

interface DisplayPeer {
  id: string; // 'self' for local
  name: string;
  stream: MediaStream | null;
  muted: boolean;
}

export function MainDisplay({ children }: MainDisplayProps) {
  const { focusedPeerId, layoutMode, localStream, localScreenStream, localSpeedDialStream } =
    useSessionStore();
  const { peers } = usePeerStore();
  const { profile } = useUserStore();

  const focusedPeer = peers.find((p) => p.id === focusedPeerId);
  const localName = profile?.displayName || 'You';

  // Spotlight stream (shared by spotlight and screen-pip layouts)
  let spotlightStream: MediaStream | null = null;
  let spotlightName = localName;
  let isSpeedDial = false;
  let isScreenShare = false;
  let pipCameraStream: MediaStream | null = null;

  if (focusedPeer) {
    spotlightName = focusedPeer.name;
    if (layoutMode === 'screen-pip') {
      // Force screen on top, camera as PIP. Fall back to camera if no screen.
      spotlightStream = focusedPeer.screenStream || focusedPeer.stream;
      isScreenShare = focusedPeer.screenStream !== null;
      pipCameraStream =
        focusedPeer.screenStream && focusedPeer.stream ? focusedPeer.stream : null;
    } else {
      // Spotlight (or grid header): existing priority speedDial > screen > camera
      spotlightStream =
        focusedPeer.speedDialStream || focusedPeer.screenStream || focusedPeer.stream;
      isSpeedDial = focusedPeer.speedDialStream !== null;
      isScreenShare = !isSpeedDial && focusedPeer.screenStream !== null;
    }
  } else {
    if (layoutMode === 'screen-pip') {
      spotlightStream = localScreenStream || localStream;
      isScreenShare = localScreenStream !== null;
      pipCameraStream = localScreenStream && localStream ? localStream : null;
    } else {
      spotlightStream = localSpeedDialStream || localScreenStream || localStream;
      isSpeedDial = localSpeedDialStream !== null;
      isScreenShare = !isSpeedDial && localScreenStream !== null;
    }
  }

  // Grid roster: local + every connected peer with a camera or fallback name
  const gridPeers: DisplayPeer[] = useMemo(() => {
    if (layoutMode !== 'grid') return [];
    const list: DisplayPeer[] = [
      { id: 'self', name: localName, stream: localStream, muted: true }
    ];
    for (const peer of peers) {
      list.push({ id: peer.id, name: peer.name, stream: peer.stream, muted: false });
    }
    return list;
  }, [layoutMode, localName, localStream, peers]);

  if (layoutMode === 'grid') {
    const n = gridPeers.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);

    return (
      <div
        className="video-cell relative bg-black"
        role="region"
        aria-label={`Grid layout with ${n} participant${n === 1 ? '' : 's'}`}
        data-layout-mode="grid"
      >
        <div
          className="absolute inset-0 grid gap-2 p-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
          }}
        >
          {gridPeers.map((p) => (
            <GridTile key={p.id} peer={p} />
          ))}
        </div>
        {/* Controls anchored to grid container */}
        <div
          style={
            {
              position: 'absolute',
              left: '50%',
              bottom: '0.5rem',
              transform: 'translateX(-50%)'
            } as React.CSSProperties
          }
        >
          {children}
        </div>
      </div>
    );
  }

  // spotlight or screen-pip
  return (
    <div
      className="video-cell relative bg-black"
      role="region"
      aria-label={`Main video display showing ${spotlightName}${isSpeedDial ? ' speed dial' : isScreenShare ? ' screen share' : ''}`}
      data-layout-mode={layoutMode}
    >
      {spotlightStream ? (
        <>
          <VideoElement stream={spotlightStream} muted={!focusedPeer} className="w-full h-full" />

          {/* PIP overlay (screen-pip layout only) */}
          {layoutMode === 'screen-pip' && pipCameraStream && (
            <div
              className="absolute bottom-4 right-4 w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20"
              data-testid="layout-pip-camera"
            >
              <VideoElement
                stream={pipCameraStream}
                muted={!focusedPeer}
                className="w-full h-full"
                anchor={false}
              />
            </div>
          )}

          {/* Name overlay (spotlight only) */}
          {layoutMode === 'spotlight' && (
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 text-white text-sm font-medium">
              {spotlightName}
            </div>
          )}

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
              {spotlightName.charAt(0).toUpperCase()}
            </div>
            <p className="text-base sm:text-lg">{spotlightName}</p>
            <p className="text-xs sm:text-sm text-gray-600">No video</p>
          </div>
        </div>
      )}
    </div>
  );
}

function GridTile({ peer }: { peer: DisplayPeer }) {
  return (
    <div
      className="relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center"
      data-testid={`grid-tile-${peer.id}`}
    >
      {peer.stream ? (
        <VideoElement stream={peer.stream} muted={peer.muted} className="w-full h-full" />
      ) : (
        <div className="text-center text-gray-500 px-2">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 rounded-full bg-gray-700 flex items-center justify-center text-xl sm:text-2xl font-bold">
            {peer.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-xs sm:text-sm truncate">{peer.name}</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium truncate max-w-[80%]">
        {peer.name}
      </div>
    </div>
  );
}
