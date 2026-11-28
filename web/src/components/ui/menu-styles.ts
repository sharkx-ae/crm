// One family for every floating list: the Select, the Menu (language, project switcher) and the Popover share this
// surface and this row, so they open, look and highlight the same way (mockup `.pop`): white, hairline, 12px radius,
// 6px padding, rows of 9px 10px with an 8px radius that wash to the shell grey on hover or keyboard highlight.
export const MENU_SURFACE =
  'z-97 rounded-xl border border-sx-border bg-sx-paper p-1.5 shadow-sx-md outline-none data-[state=open]:animate-sx-pop motion-reduce:animate-none';

// Menus and popovers size to their content between 240 and 360px and scroll past 70% of the screen height.
export const MENU_SIZE = 'max-h-[70dvh] min-w-[240px] max-w-[360px] overflow-auto';

export const MENU_ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-start font-label text-sx-black no-underline outline-none transition-colors duration-150 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sx-red data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-sx-shell';
