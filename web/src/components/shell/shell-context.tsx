'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { Role } from '../../contracts/common.ts';
import type { ProjectOption } from '../../contracts/projects.ts';

// What every shell part needs about the visitor. Never the email (web plan §2.2).
export type ShellMe = { name: string; role: Role; projectIds: string[] };
export type ShellValue = { me: ShellMe; options: ProjectOption[] };

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellValue; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const v = useContext(ShellContext);
  if (!v) throw new Error('useShell needs the AppShell');
  return v;
}
