'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { UserSummary } from '../../contracts/auth.ts';
import { setUserStatus } from '../../lib/actions/users.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { useLocalTable } from '../../lib/use-local-table.ts';
import { Avatar } from '../ui/avatar.tsx';
import { UserText } from '../ui/bidi.tsx';
import { Button } from '../ui/button.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Pagination } from '../ui/pagination.tsx';
import { SortTh, Table, Td, Th } from '../ui/table.tsx';
import { useToast } from '../ui/toast.tsx';
import { useErrorToast } from '../ui/use-error-toast.ts';

const DOT: Record<UserSummary['status'], string> = {
  active: 'bg-sx-ok',
  invited: 'bg-sx-warn',
  disabled: 'bg-sx-faint',
};

type SortKey = 'name' | 'email' | 'status';
const sortValue = (u: UserSummary, key: SortKey) => u[key];

// Managers (Team, F2b S3) and client users (F10a S2): name, email, status, Disable/Enable. Disabling signs the person
// out at once (the api revokes their sessions) and takes a manager out of round-robin.
export function UsersTable({
  users,
  emptyText,
  tone = 'ink',
}: {
  users: UserSummary[];
  emptyText: string;
  tone?: 'ink' | 'soft';
}) {
  const t = useTranslations('team');
  const tUi = useTranslations('ui');
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const showError = useErrorToast();
  const [, start] = useTransition();
  const table = useLocalTable(users, sortValue);

  const toggle = (u: UserSummary) => {
    const status = u.status === 'disabled' ? 'active' : 'disabled';
    setBusy(u.id);
    start(async () => {
      const res = await setUserStatus({ userId: u.id, status });
      setBusy(null);
      if (!res.ok) {
        showError(res.error);
        return;
      }
      toast(t(status === 'disabled' ? 'toast.disabled' : 'toast.enabled', { name: u.name }));
      router.refresh();
    });
  };

  if (users.length === 0) return <EmptyState title={emptyText} />;

  return (
    <>
      <Table aria-label={t('table.label')}>
        <thead>
          <tr>
            {(['name', 'email', 'status'] as const).map((key) => (
              <SortTh
                key={key}
                sortKey={key}
                active={table.sort.sort}
                dir={table.sort.dir}
                onSort={table.onSort}
                label={tUi('sortBy', { column: t(`table.${key}`) })}
              >
                {t(`table.${key}`)}
              </SortTh>
            ))}
            <Th>
              <span className="sr-only">{t('table.actions')}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {table.view.map((u) => (
            <tr key={u.id}>
              <Td>
                <span className="flex items-center gap-2.5">
                  <Avatar name={u.name} size="sm" tone={tone} />
                  <span className="font-heading">
                    <UserText>{u.name}</UserText>
                  </span>
                </span>
              </Td>
              <Td>
                <bdi dir="ltr">{u.email}</bdi>
              </Td>
              <Td>
                <span className="inline-flex items-center gap-2">
                  <i aria-hidden="true" className={`block size-2 rounded-full ${DOT[u.status]}`} />
                  {t(`status.${u.status}`)}
                </span>
              </Td>
              <Td className="text-end">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === u.id}
                  aria-label={t(
                    u.status === 'disabled' ? 'table.enableName' : 'table.disableName',
                    { name: u.name },
                  )}
                  onClick={() => toggle(u)}
                >
                  {t(u.status === 'disabled' ? 'table.enable' : 'table.disable')}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination
        page={table.page}
        size={table.size}
        total={table.total}
        shown={table.view.length}
        onPageChange={table.onPageChange}
        onSizeChange={table.onSizeChange}
      />
    </>
  );
}
