'use client';

import { useTranslations } from 'next-intl';
import { Link } from '../../lib/i18n/navigation.ts';
import { Avatar } from '../ui/avatar.tsx';
import { UserText } from '../ui/bidi.tsx';
import { Icon } from '../ui/icons.tsx';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/menu.tsx';
import { useShell } from './shell-context.tsx';

/** Staff only: jump between clients, or back to the agency workspace ("All clients"). */
export function ProjectSwitcher({ projectId }: { projectId: string | null }) {
  const t = useTranslations('shell.switcher');
  const { me, options } = useShell();
  const current = options.find((o) => o.id === projectId) ?? null;

  return (
    <Menu
      align="start"
      label={t('label')}
      trigger={
        <button
          type="button"
          className="focus-ring flex h-10 max-w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-field ps-2 pe-2 text-start transition-colors duration-150 hover:bg-sx-shell"
        >
          {current ? (
            <Avatar name={current.name} shape="square" color={current.color} />
          ) : (
            <Icon name="grid" />
          )}
          <span className="min-w-0 truncate font-label text-sx-black">
            {current ? <UserText>{current.name}</UserText> : t('agencyWorkspace')}
          </span>
          <Icon name="down" size="sm" className="flex-none text-sx-muted" />
        </button>
      }
    >
      <MenuLabel>{t('label')}</MenuLabel>
      <MenuItem asChild>
        <Link href="/clients">
          <Icon name="grid" size="sm" />
          {t('allClients')}
        </Link>
      </MenuItem>
      <MenuSeparator />
      {options.length === 0 ? (
        <>
          <MenuItem disabled>{t('noClients')}</MenuItem>
          {me.role === 'super_admin' ? (
            <MenuItem asChild>
              <Link href="/clients?new=1">
                <Icon name="plus" size="sm" />
                {t('addClient')}
              </Link>
            </MenuItem>
          ) : null}
        </>
      ) : (
        options.map((o) => (
          <MenuItem key={o.id} asChild>
            <Link
              href={`/p/${o.id}/overview`}
              aria-current={o.id === projectId ? 'true' : undefined}
            >
              <Avatar name={o.name} shape="square" size="sm" color={o.color} />
              <UserText>{o.name}</UserText>
            </Link>
          </MenuItem>
        ))
      )}
    </Menu>
  );
}

/** Client users have no switcher: a fixed block with their own client. */
export function ClientBlock() {
  const t = useTranslations('shell.switcher');
  const { options } = useShell();
  const own = options[0];
  if (!own) return null;
  return (
    <div className="flex min-w-0 items-center gap-2.5 ps-2">
      <Avatar name={own.name} shape="square" color={own.color} />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-label text-sx-black">
          <UserText>{own.name}</UserText>
        </p>
        <p className="truncate text-label text-sx-muted">{t('clientDashboard')}</p>
      </div>
    </div>
  );
}
