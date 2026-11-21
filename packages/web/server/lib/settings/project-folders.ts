import type { createSettingsNormalizationRuntime } from './settings-normalization-runtime.js';

type Normalization = ReturnType<typeof createSettingsNormalizationRuntime>;

type ProjectListCarrier = {
  projects?: unknown;
  projectFolders?: unknown;
};

const requireSanitizer = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new TypeError(`createSettingsHelpers requires ${name}`);
  }
  return value;
};

export const createProjectListUpdate = (
  sanitizeProjects: Normalization['sanitizeProjects'] | undefined,
  sanitizeProjectFolders: Normalization['sanitizeProjectFolders'] | undefined,
) => {
  const sanitize = requireSanitizer(sanitizeProjects, 'sanitizeProjects');
  const sanitizeFolders = requireSanitizer(sanitizeProjectFolders, 'sanitizeProjectFolders');
  return (result: ProjectListCarrier, candidate: ProjectListCarrier): void => {
    if (Array.isArray(candidate.projects)) {
      const projects = sanitize(candidate.projects);
      if (projects) {
        result.projects = projects;
      }
    }
    if (Array.isArray(candidate.projectFolders)) {
      const projectFolders = sanitizeFolders(candidate.projectFolders);
      if (projectFolders) {
        result.projectFolders = projectFolders;
      }
    }
  };
};
