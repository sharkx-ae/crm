type Tree = { [key: string]: string | Tree };

const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

// A locale catalog may be partial: every key it lacks falls back to English instead of showing a missing-message error.
export function withFallback(base: Tree, overrides: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const inherited = out[key];
    out[key] = isTree(value) && isTree(inherited) ? withFallback(inherited, value) : value;
  }
  return out;
}

// The browser gets only the modules its client components use (smaller payload, no staff copy in a client's page).
export function pickModules<T extends Record<string, unknown>, K extends string>(
  messages: T,
  modules: readonly K[],
): Pick<T, Extract<K, keyof T>> {
  return Object.fromEntries(
    modules.filter((m) => m in messages).map((m) => [m, messages[m]]),
  ) as unknown as Pick<T, Extract<K, keyof T>>;
}
