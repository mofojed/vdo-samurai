import gateImg from '/gate.png';
import { formatBytes, type RacerData } from './transferRacers';

if (typeof window !== 'undefined') {
  const img = new Image();
  img.src = '/samurai-sprite.png';
}

function SamuraiSprite({
  animation,
  isYou,
  className = ''
}: {
  animation: 'run' | 'idle';
  isYou: boolean;
  className?: string;
}) {
  const animClass = animation === 'run' ? 'samurai-sprite-run' : 'samurai-sprite-idle';
  const tintClass = isYou ? 'samurai-tint-red' : 'samurai-tint-blue';
  return <div className={`samurai-sprite ${animClass} ${tintClass} ${className}`} />;
}

export function RacerRow({ racer, position }: { racer: RacerData; position: number }) {
  const isYou = racer.isYou;
  const progressPercent = Math.round(racer.progress * 100);
  const samuraiPos = Math.min(racer.progress * 100, 85);
  const fillPos = racer.status === 'finished' ? 100 : Math.pow(racer.progress, 1.1) * 100;
  const samuraiAnimation = racer.status === 'racing' ? 'run' : 'idle';

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[--color-primary]/60 text-xs font-mono">#{position}</span>
          <span
            className={`text-sm font-semibold ${isYou ? 'text-[--color-primary]' : 'text-gray-200'}`}
          >
            {racer.name}
            {isYou && (
              <span className="ml-1.5 text-[10px] bg-[--color-primary]/20 text-[--color-primary] px-1.5 py-0.5 rounded-full">
                YOU
              </span>
            )}
          </span>
        </div>
        <div className="text-xs text-gray-400 font-mono tabular-nums">
          {racer.completedCount}/{racer.fileCount} files
        </div>
      </div>

      <div className="relative h-10 bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div
          className={`absolute z-0 left-0 top-0 bottom-0 transition-all duration-500 ease-out overflow-hidden ${
            racer.status === 'finished'
              ? 'race-fill-finished'
              : racer.status === 'racing'
                ? isYou
                  ? 'race-fill-racing-you'
                  : 'race-fill-racing-other'
                : 'bg-gray-800/30'
          }`}
          style={{ width: `${fillPos}%` }}
        />

        <div className="absolute z-10 right-1 top-0 bottom-0 flex items-center justify-center">
          <img src={gateImg} alt="Finish gate" className="h-full object-contain" />
        </div>

        <div
          className="absolute z-20 bottom-0 transition-all duration-500 ease-out"
          style={{ left: `${samuraiPos}%` }}
        >
          <SamuraiSprite animation={samuraiAnimation} isYou={isYou} className="drop-shadow-lg" />
        </div>

        <div
          className={`absolute z-30 left-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold ${
            racer.status === 'finished'
              ? 'text-emerald-400'
              : racer.status === 'racing'
                ? 'text-[--color-primary]'
                : 'text-gray-500'
          }`}
        >
          {String(progressPercent).padStart(2, '0')}%
        </div>
      </div>

      <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-gray-500">
        <span>
          {racer.status === 'finished' && <span className="text-emerald-500">✓ Complete</span>}
          {racer.status === 'racing' && (
            <span className="text-[--color-primary] samurai-dots">Sending</span>
          )}
          {racer.status === 'idle' && <span>Waiting</span>}
        </span>
        <span className="font-mono tabular-nums">
          {formatBytes(racer.transferredSize)} / {formatBytes(racer.totalSize)}
        </span>
      </div>
    </div>
  );
}
