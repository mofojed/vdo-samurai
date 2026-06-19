import { useState, useCallback } from 'react';

interface DownloadButtonProps {
  outputBlob: Blob;
  outputUrl: string;
  outputFormat: string;
  roomName?: string | null;
  onDone?: () => void;
  showPreview?: boolean;
}

export function DownloadButton({
  outputBlob,
  outputUrl,
  outputFormat,
  roomName,
  onDone,
  showPreview = true
}: DownloadButtonProps) {
  const [customFilename, setCustomFilename] = useState('');

  const fileSizeMB = (outputBlob.size / (1024 * 1024)).toFixed(1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safeRoomName = (roomName || 'vdo-samurai')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const defaultFilename = `${safeRoomName || 'vdo-samurai'}-${dateStr}-${timeStr}.${outputFormat}`;

  const handleDownload = useCallback(() => {
    const name = customFilename || defaultFilename;
    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [outputBlob, customFilename, defaultFilename]);

  return (
    <div className="space-y-4">
      {/* Video preview */}
      {showPreview && (
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          <video src={outputUrl} controls className="w-full h-full" playsInline />
        </div>
      )}

      {/* File info */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Output Size</span>
        <span className="text-white font-medium">{fileSizeMB} MB</span>
      </div>

      {/* Filename input */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Filename (optional)</label>
        <input
          type="text"
          value={customFilename}
          onChange={(e) => setCustomFilename(e.target.value)}
          placeholder={defaultFilename}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[--color-primary]"
        />
      </div>

      {/* Action buttons */}
      <button
        onClick={handleDownload}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[--color-primary] hover:bg-[--color-primary]/80 text-white font-semibold transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Download
      </button>

      {/* Privacy notice */}
      <p className="text-xs text-gray-500 text-center">
        Your video is processed entirely on your device. No data is uploaded to any server.
      </p>

      {/* Done button */}
      {onDone && (
        <button
          onClick={onDone}
          className="w-full py-3 px-4 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          data-testid="export-done-button"
        >
          Done
        </button>
      )}
    </div>
  );
}
