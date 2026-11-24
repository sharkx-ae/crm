import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { ProjectProvider } from '../../../../../components/shell/project-context.tsx';
import { getProject } from '../../../../../lib/data/projects.ts';

// The open client. A malformed id, an unknown one and another client's all give the same not-found page.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const project = await getProject(projectId);
  if (!project) notFound();
  const { id, name, city, industry, color, timezone } = project;
  return (
    <ProjectProvider value={{ id, name, city, industry, color, timezone }}>
      {children}
    </ProjectProvider>
  );
}
