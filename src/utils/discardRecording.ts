import { useNLEStore } from '../store/nleStore';
import { useRecordingStore } from '../store/recordingStore';
import { useTransferStore } from '../store/transferStore';

/**
 * Wipe all state for the current recording session: NLE clips/timeline,
 * the recorded blobs, and any received transfer payloads. Used by both the
 * NLE editor's "Discard" button and the title-bar Files menu.
 */
export function discardRecordingSession(): void {
  useNLEStore.getState().reset();
  useRecordingStore.getState().reset();
  useTransferStore.getState().clearReceivedRecordings();
}
