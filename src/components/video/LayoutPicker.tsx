import { useSessionStore, type LayoutMode } from '../../store/sessionStore';
import { useTrystero } from '../../contexts/TrysteroContext';

interface LayoutPickerProps {
  isHost: boolean;
}

const LAYOUTS: Array<{ mode: LayoutMode; label: string; testId: string; icon: JSX.Element }> = [
  {
    mode: 'spotlight',
    label: 'Spotlight',
    testId: 'layout-spotlight',
    icon: (
      <svg
        className="w-5 h-5 sm:w-6 sm:h-6 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    )
  },
  {
    mode: 'screen-pip',
    label: 'Screen + camera',
    testId: 'layout-screen-pip',
    icon: (
      <svg
        className="w-5 h-5 sm:w-6 sm:h-6 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="13" rx="1.5" strokeWidth={2} />
        <rect x="13" y="11" width="6" height="4" rx="0.75" strokeWidth={2} fill="currentColor" />
      </svg>
    )
  },
  {
    mode: 'grid',
    label: 'Grid',
    testId: 'layout-grid',
    icon: (
      <svg
        className="w-5 h-5 sm:w-6 sm:h-6 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={2} />
      </svg>
    )
  }
];

export function LayoutPicker({ isHost }: LayoutPickerProps) {
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const { broadcastLayoutChange } = useTrystero();

  if (!isHost) return null;

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Layout mode"
      data-testid="layout-picker"
    >
      {LAYOUTS.map(({ mode, label, testId, icon }) => {
        const isActive = layoutMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => broadcastLayoutChange(mode)}
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            data-testid={testId}
            data-active={isActive ? 'true' : 'false'}
            className={`p-2 sm:p-3 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
              isActive
                ? 'bg-white/90 text-black'
                : 'bg-black/50 hover:bg-black/70 text-white'
            }`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
