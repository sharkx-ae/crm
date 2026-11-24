import { cx } from '../../lib/cx.ts';
import { initials, onColor } from '../../lib/design/avatar.ts';

export type AvatarTone = 'ink' | 'red' | 'soft';

const TONE: Record<AvatarTone, string> = {
  ink: 'bg-sx-black text-white',
  red: 'bg-sx-red text-white',
  soft: 'bg-sx-red-soft text-sx-black',
};
// Circle = a person (34px, 26px small). Square = a client (28px with 8px radius, 22px small).
const SIZE = {
  circle: { md: 'size-[34px] rounded-full text-label', sm: 'size-[26px] rounded-full text-[11px]' },
  square: { md: 'size-7 rounded-lg text-[11px]', sm: 'size-[22px] rounded-[7px] text-[10px]' },
} as const;

/**
 * Initials in a circle (a person) or a square (a client). Decorative: the name always sits next to it.
 * Pass `color` (a brand token hex) for a client square; the letters switch between ink and white for contrast.
 */
export function Avatar({
  name,
  shape = 'circle',
  size = 'md',
  tone = 'ink',
  color,
}: {
  name: string;
  shape?: 'circle' | 'square';
  size?: 'md' | 'sm';
  tone?: AvatarTone;
  color?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid flex-none place-items-center font-heading',
        SIZE[shape][size],
        !color && TONE[tone],
      )}
      style={color ? { backgroundColor: color, color: onColor(color) } : undefined}
    >
      {initials(name)}
    </span>
  );
}
