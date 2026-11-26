// Public API of the projects module. Other modules (and app.ts) use only what is exported here.
export { PROJECT_COLORS } from './colors.ts';
export { createProject, DEFAULT_STAGES, nameFromEmail, updateProjectSettings } from './create.ts';
export { DOT_ORDER, projectsHome } from './home.ts';
export { projectRoutes } from './routes.ts';
export { getProjectDetail, listProjectOptions } from './service.ts';
