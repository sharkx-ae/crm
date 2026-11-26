import type { Source } from '../../contracts/common.ts';
import { Icon } from '../ui/icons.tsx';
import { SOURCE_MARKS } from './source-marks.ts';

const TILE = 22;

/** A platform's mark on an app-icon tile. Decorative: the platform's name always sits next to it. */
export function SourceMark({ source }: { source: Source }) {
  const mark = source in SOURCE_MARKS ? SOURCE_MARKS[source as keyof typeof SOURCE_MARKS] : null;
  const style = {
    width: TILE,
    height: TILE,
    borderRadius: TILE * 0.27,
    background: mark?.bg ?? (source === 'csv' ? '#e8e7e7' : '#1c0f0f'),
    color: mark?.fg ?? (source === 'csv' ? '#1c0f0f' : '#ffffff'),
  };
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-grid flex-none place-items-center shadow-[inset_0_0_0_1px_rgb(28_15_15/0.08)]"
    >
      {mark ? (
        <svg viewBox="0 0 24 24" className="size-[58%]" aria-hidden="true">
          <path d={mark.d} fill="currentColor" />
        </svg>
      ) : (
        <Icon name={source === 'csv' ? 'upload' : 'globe'} size="sm" className="size-[56%]" />
      )}
    </span>
  );
}

/** Platform mark and name, as the Source column and the drawer show it. */
export function SourceBadge({ source, label }: { source: Source; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <SourceMark source={source} />
      {label}
    </span>
  );
}
