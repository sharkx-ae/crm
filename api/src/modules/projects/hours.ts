import type { BusinessHoursDay } from '../../contracts/projects.ts';
import type { LegacyBusinessHours } from './schema.ts';

/**
 * The contract's seven per-day entries from what the column holds. Until migration 0003 (F4a) the column keeps the
 * F1b shape `{ days, start, end }`; after it, the value already is the array and passes through.
 */
export function toDailyHours(stored: LegacyBusinessHours | BusinessHoursDay[]): BusinessHoursDay[] {
  if (Array.isArray(stored)) return stored;
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    open: stored.days.includes(day),
    from: stored.start,
    to: stored.end,
  }));
}
