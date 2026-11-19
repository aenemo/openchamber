export const applyProjectListUpdate = (result, candidate, sanitizeProjects, sanitizeProjectFolders) => {
  if (Array.isArray(candidate.projects)) {
    const projects = sanitizeProjects(candidate.projects);
    if (projects) {
      result.projects = projects;
    }
  }
  if (Array.isArray(candidate.projectFolders)) {
    const projectFolders = sanitizeProjectFolders(candidate.projectFolders);
    if (projectFolders) {
      result.projectFolders = projectFolders;
    }
  }
};
