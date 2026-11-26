import { cx } from '../../lib/cx.ts';
import { Icon } from './icons.tsx';

/**
 * The search box of a toolbar (mockup `.search`): 36px high, grows between 200 and 340px. The input draws no outline of
 * its own; the whole box gets the brand's 3px red ring on keyboard focus. The label is for screen readers.
 */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label
      className={cx(
        'flex h-9 min-w-[200px] max-w-[340px] flex-1 items-center gap-2.5 rounded-field border border-sx-line bg-sx-paper ps-3 pe-3 text-sx-muted transition-colors duration-150 focus-within:border-sx-black hover:border-sx-black has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-sx-red',
        className,
      )}
    >
      <Icon name="search" size="sm" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-sx-black outline-none placeholder:text-sx-muted"
      />
    </label>
  );
}
