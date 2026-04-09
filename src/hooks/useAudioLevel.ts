import { useState, useEffect, useRef, useCallback } from 'react';

// Shared AudioContext singleton — Chromium silences audio when multiple AudioContexts
// consume tracks from the same device. Sharing one context avoids the issue.
// Stored on globalThis so it survives Vite HMR module reloads.
// Never closed — reused for the lifetime of the page (lightweight).
interface AudioLevelGlobals {
  __audioLevelCtx?: AudioContext | null;
}

function getSharedAudioContext(): AudioContext {
  const g = globalThis as AudioLevelGlobals;
  if (!g.__audioLevelCtx || g.__audioLevelCtx.state === 'closed') {
    g.__audioLevelCtx = new AudioContext();
    console.log('[useAudioLevel] Created shared AudioContext');
  }
  // Always resume — Chrome/Electron autoplay policy may start it suspended
  if (g.__audioLevelCtx.state === 'suspended') {
    g.__audioLevelCtx.resume();
  }
  return g.__audioLevelCtx;
}

export function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startAnalysis = useCallback((audioStream: MediaStream) => {
    // Clean up any previous analysis
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      return false;
    }

    const track = audioTracks[0];
    console.log('[useAudioLevel] Starting analysis:', {
      trackEnabled: track.enabled,
      trackMuted: track.muted,
      trackReadyState: track.readyState
    });

    const audioContext = getSharedAudioContext();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);

    analyserRef.current = analyser;
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyser.fftSize);
    let frameCount = 0;

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const normalizedLevel = Math.min(rms * 4, 1);

      setLevel(normalizedLevel);

      frameCount++;
      if (frameCount % 300 === 0) {
        const trk = audioStream.getAudioTracks()[0];
        console.log('[useAudioLevel] status:', {
          ctxState: audioContext.state,
          trackState: trk?.readyState,
          trackEnabled: trk?.enabled,
          trackMuted: trk?.muted,
          rms: rms.toFixed(4),
          level: normalizedLevel.toFixed(3)
        });
      }

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    animationFrameRef.current = requestAnimationFrame(updateLevel);

    cleanupRef.current = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      source.disconnect();
      analyserRef.current = null;
      sourceRef.current = null;
    };

    return true;
  }, []);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }

    // Try to start analysis immediately
    const started = startAnalysis(stream);

    // If no audio tracks yet, listen for them being added
    const handleAddTrack = (event: MediaStreamTrackEvent) => {
      if (event.track.kind === 'audio') {
        console.log('[useAudioLevel] Audio track added to stream, starting analysis');
        startAnalysis(stream);
      }
    };

    if (!started) {
      stream.addEventListener('addtrack', handleAddTrack);
    }

    // Also listen for the track unmuting (cloned tracks may start muted)
    const audioTrack = stream.getAudioTracks()[0];
    const handleUnmute = () => {
      console.log('[useAudioLevel] Audio track unmuted, restarting analysis');
      startAnalysis(stream);
    };
    if (audioTrack?.muted) {
      audioTrack.addEventListener('unmute', handleUnmute, { once: true });
    }

    return () => {
      stream.removeEventListener('addtrack', handleAddTrack);
      if (audioTrack) {
        audioTrack.removeEventListener('unmute', handleUnmute);
      }
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [stream, startAnalysis]);

  return { level };
}
