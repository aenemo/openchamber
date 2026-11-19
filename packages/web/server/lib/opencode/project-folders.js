const requireSanitizer = (value, name) => {
  if (typeof value !== 'function') {
    throw new TypeError(`createSettingsHelpers requires ${name}`);
  }
  return value;
};

export const createProjectListUpdate = (sanitizeProjects, sanitizeProjectFolders) => {
  const sanitize = requireSanitizer(sanitizeProjects, 'sanitizeProjects');
  const sanitizeFolders = requireSanitizer(sanitizeProjectFolders, 'sanitizeProjectFolders');
  return (result, candidate) => {
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
