import { useEffect, useCallback } from 'react';
import { useRecordingStore, type EditPoint } from '../store/recordingStore';
import { useSessionStore } from '../store/sessionStore';

export function useEditPoints() {
  const { isRecording, startTime, addEditPoint, editPoints } = useRecordingStore();
  const { focusedPeerId, layoutMode } = useSessionStore();

  // Log focus changes as edit points during recording
  useEffect(() => {
    if (isRecording && startTime) {
      const point: EditPoint = {
        timestamp: Date.now() - startTime,
        focusedPeerId,
        layoutMode,
        type: 'focus-change'
      };
      addEditPoint(point);
    }
    // layoutMode intentionally excluded — focus and layout are recorded as separate
    // edit points, but each carries the current value of both at capture time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPeerId, isRecording, startTime, addEditPoint]);

  // Log layout changes as edit points during recording
  useEffect(() => {
    if (isRecording && startTime) {
      const point: EditPoint = {
        timestamp: Date.now() - startTime,
        focusedPeerId,
        layoutMode,
        type: 'layout-change'
      };
      addEditPoint(point);
    }
    // focusedPeerId intentionally excluded — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, isRecording, startTime, addEditPoint]);

  const addMarker = useCallback(() => {
    if (isRecording && startTime) {
      const point: EditPoint = {
        timestamp: Date.now() - startTime,
        focusedPeerId,
        layoutMode,
        type: 'marker'
      };
      addEditPoint(point);
    }
  }, [isRecording, startTime, focusedPeerId, layoutMode, addEditPoint]);

  return { editPoints, addMarker };
}
