// The client-settings tabs that exist today, in order (shared by the server redirect and the client tab bar).
// Each spec adds its tab here when its page lands: Client users (F10a), Lead qualification (F10b), and so on.
export const SETTINGS_TABS = [
  { slug: 'client-users', labelKey: 'tab.clientUsers' },
  { slug: 'hours', labelKey: 'tab.hours' },
] as const;
