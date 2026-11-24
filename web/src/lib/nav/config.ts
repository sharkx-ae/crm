import type { IconName } from '../../components/ui/icons.tsx';
import type { Role } from '../../contracts/common.ts';
import type { RouteKey } from './routes.ts';

// What the rail shows, per role (web plan §2.3). `agency` = no client open; `project` = inside /p/<id>.
// An item that is not `ready` is hidden, not greyed: the spec that lands the route flips it (inbox F3c,
// leads/contacts F4b, pipeline F8a, tasks F8b, reports F13b, integrations F14b, team/settings F2b, audit F1e).
export type NavItem = {
  key: RouteKey;
  icon: IconName;
  /** Key under `shell`: `nav.<key>`, or `navClient.<key>` for the client wording. */
  labelKey: string;
  ready: boolean;
};
export type NavGroup = { labelKey?: string; items: NavItem[] };
export type RoleNav = { agency: NavGroup[]; project: NavGroup[] };

const READY: ReadonlySet<RouteKey> = new Set<RouteKey>(['clients', 'team', 'overview', 'settings']);

const item = (key: RouteKey, icon: IconName, labelKey = `nav.${key}`): NavItem => ({
  key,
  icon,
  labelKey,
  ready: READY.has(key),
});

const staffProject: NavGroup[] = [
  {
    labelKey: 'group.workspace',
    items: [
      item('overview', 'grid'),
      item('inbox', 'chat'),
      item('leads', 'target'),
      item('contacts', 'users'),
      item('pipeline', 'board'),
      item('tasks', 'check'),
      item('reports', 'chart'),
    ],
  },
  { labelKey: 'group.setup', items: [item('integrations', 'plug'), item('settings', 'cog')] },
];

export const NAV: Record<Role, RoleNav> = {
  super_admin: {
    agency: [
      { labelKey: 'group.agency', items: [item('clients', 'home')] },
      { labelKey: 'group.admin', items: [item('team', 'user'), item('audit', 'shield')] },
    ],
    project: staffProject,
  },
  manager: {
    agency: [{ labelKey: 'group.agency', items: [item('clients', 'home')] }],
    project: staffProject,
  },
  client: {
    agency: [],
    project: [
      {
        items: [
          item('overview', 'grid'),
          item('leads', 'target'),
          item('inbox', 'chat', 'navClient.inbox'),
          item('reports', 'chart'),
          item('integrations', 'plug', 'navClient.integrations'),
        ],
      },
    ],
  },
};

/** The groups to draw: ready items only, empty groups dropped. */
export function visibleNav(role: Role, mode: 'agency' | 'project'): NavGroup[] {
  return NAV[role][mode]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.ready) }))
    .filter((g) => g.items.length > 0);
}
