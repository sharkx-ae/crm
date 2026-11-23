import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing.ts';

// Locale-aware Link, redirect and router: new code uses these instead of building `/${locale}` by hand.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
