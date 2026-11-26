'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import type { Locale } from '../../contracts/common.ts';
import { logout, updateMe } from '../../lib/actions/auth.ts';
import { usePathname, useRouter } from '../../lib/i18n/navigation.ts';
import { routing } from '../../lib/i18n/routing.ts';
import { Avatar } from '../ui/avatar.tsx';
import { UserText } from '../ui/bidi.tsx';
import { IconButton } from '../ui/button.tsx';
import { Icon } from '../ui/icons.tsx';
import { Menu, MenuItem, MenuLabel } from '../ui/menu.tsx';
import { useToast } from '../ui/toast.tsx';
import { ClientBlock, ProjectSwitcher } from './project-switcher.tsx';
import { useShell } from './shell-context.tsx';

/** EN / العربية / FR. Saves the choice on the user, then reloads the same page in that language. */
export function LanguageMenu() {
  const t = useTranslations('shell.language');
  const tErr = useTranslations('errors');
  const { toast } = useToast();
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Switch only once the choice is saved, so the URL never shows a language the account does not have.
  const choose = (locale: Locale) =>
    start(async () => {
      if (locale === active) return;
      const res = await updateMe({ locale });
      if (!res.ok) {
        toast(tErr(res.error.code));
        return;
      }
      router.replace(`${pathname}${window.location.search}`, { locale });
    });

  return (
    <Menu
      label={t('label')}
      trigger={
        <button
          type="button"
          aria-label={t('label')}
          aria-busy={pending || undefined}
          className="focus-ring flex h-10 flex-none cursor-pointer items-center gap-1.5 rounded-field ps-2.5 pe-2.5 font-label text-sx-black transition-colors duration-150 hover:bg-sx-shell"
        >
          <Icon name="globe" />
          {/* The language name from 900px up; under it the short code (EN, AR, FR), so the 360px bar keeps room for the client. */}
          <span className="hidden rail:inline">{t(active)}</span>
          <span dir="ltr" className="rail:hidden">
            {active.toUpperCase()}
          </span>
        </button>
      }
    >
      <MenuLabel>{t('label')}</MenuLabel>
      {routing.locales.map((l) => (
        <MenuItem
          key={l}
          lang={l}
          aria-current={l === active ? 'true' : undefined}
          onSelect={() => choose(l)}
        >
          <span className="flex-1">{t(l)}</span>
          {l === active ? <Icon name="check" size="sm" className="text-sx-red" /> : null}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** Name, role and sign out. */
export function MeBlock() {
  const t = useTranslations('shell.me');
  const tRole = useTranslations('common.role');
  const { me } = useShell();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-none items-center gap-2.5">
      <Avatar name={me.name} />
      <div className="hidden min-w-0 leading-tight wide:block">
        <p className="truncate font-label text-sx-black">
          <UserText>{me.name}</UserText>
        </p>
        <p className="truncate text-label text-sx-muted">{tRole(me.role)}</p>
      </div>
      <IconButton
        icon="out"
        label={t('signOut')}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await logout({});
          })
        }
      />
    </div>
  );
}

export function Topbar({
  railId,
  railOpen,
  onToggleRail,
  projectId,
}: {
  railId: string;
  railOpen: boolean;
  onToggleRail: () => void;
  projectId: string | null;
}) {
  const t = useTranslations('shell.menu');
  const { me } = useShell();
  return (
    <header className="sticky top-0 z-80 flex h-(--top-h) items-center gap-2 border-b border-sx-border bg-sx-paper ps-3 pe-3 rail:ps-6 rail:pe-6">
      <IconButton
        id={`${railId}-toggle`}
        icon="menu"
        label={railOpen ? t('close') : t('open')}
        aria-expanded={railOpen}
        aria-controls={railId}
        onClick={onToggleRail}
        className="desk:hidden"
      />
      <div className="min-w-0 flex-1">
        {me.role === 'client' ? <ClientBlock /> : <ProjectSwitcher projectId={projectId} />}
      </div>
      <LanguageMenu />
      <MeBlock />
    </header>
  );
}
