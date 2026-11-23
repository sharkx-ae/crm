'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { ProjectOption } from '../../contracts/projects.ts';

// The open client (staff: the URL's project; client: its own). All date formatting reads the zone from here.
export type ProjectInfo = Pick<
  ProjectOption,
  'id' | 'name' | 'city' | 'industry' | 'color' | 'timezone'
>;

const ProjectContext = createContext<ProjectInfo | null>(null);

export function ProjectProvider({ value, children }: { value: ProjectInfo; children: ReactNode }) {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectInfo {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useProject needs a ProjectProvider (inside /p/[projectId])');
  return project;
}
