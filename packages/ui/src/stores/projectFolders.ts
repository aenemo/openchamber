import type { StoreApi } from 'zustand';
import { opencodeClient } from '@/lib/opencode/client';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeApiBaseUrl } from '@/lib/runtime-switch';
import { createProjectFolderId } from '@/lib/projectId';
import { parseProjectFolders } from '@/lib/settings/parsers';
import type { ProjectEntry } from '@/lib/api/types';
import type { ProjectFolder } from '@/lib/projectFolders/tree';
import type { DesktopSettings } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { getArchivedScopeKey } from '@/lib/sessionFolders/folderScopes';
import { useDirectoryStore } from './useDirectoryStore';
import { useSessionFoldersStore } from './useSessionFoldersStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getDeferredSafeStorage } from './utils/safeStorage';
import type { ProjectsStore } from './useProjectsStore';

export type ProjectTreeSnapshot = {
  projects: ProjectEntry[];
  projectFolders: ProjectFolder[];
  activeProjectId?: string | null;
  manualProjectOrder?: string[];
};

type FolderSliceState = Pick<ProjectsStore, 'projects' | 'activeProjectId' | 'projectFolders' | 'manualProjectOrder'>;

export interface ProjectFolderSlice {
  addProjectFolder: (name: string, parentId?: string | null) => ProjectFolder | null;
  renameProjectFolder: (id: string, name: string) => boolean;
  moveProjectFolder: (id: string, parentId: string | null, toIndex?: number) => boolean;
  deleteProjectFolder: (id: string, mode: 'move' | 'close', targetFolderId?: string | null) => { moved: number; closed: number };
  moveProjectToFolder: (projectId: string, folderId: string | null) => boolean;
  restoreProjectTree: (snapshot: ProjectTreeSnapshot) => void;
}

type FolderSliceHelpers = {
  persistManualProjectOrder: (manualOrder: string[]) => void;
  cacheProjects: (projects: ProjectEntry[], activeProjectId: string | null) => void;
  isVSCode: boolean;
};

const safeStorage = getDeferredSafeStorage();

const getProjectFoldersStorageKey = (): string => {
  const apiBaseUrl = getRuntimeApiBaseUrl().trim().replace(/\/+$/, '');
  const namespace = apiBaseUrl ? encodeURIComponent(apiBaseUrl) : '';
  return namespace ? `projectFolders:${namespace}` : 'projectFolders';
};

export const readPersistedProjectFolders = (): ProjectFolder[] => {
  try {
    const raw = safeStorage.getItem(getProjectFoldersStorageKey());
    if (!raw) {
      return [];
    }
    return parseProjectFolders(JSON.parse(raw), {}) ?? [];
  } catch {
    return [];
  }
};

export const persistProjectFolders = (folders: ProjectFolder[]): void => {
  safeStorage.setItem(getProjectFoldersStorageKey(), JSON.stringify(folders));
};

const collectFolderSubtreeIds = (folders: ProjectFolder[], rootId: string): Set<string> => {
  const byParent = new Map<string | null, ProjectFolder[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentId, siblings);
  }
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    // SAFETY: the loop guard above guarantees the queue is non-empty here.
    const current = queue.pop() as string;
    for (const child of byParent.get(current) ?? []) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return ids;
};

const folderAncestorIds = (folders: ProjectFolder[], folderId: string): Set<string> => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors = new Set<string>();
  let parentId = byId.get(folderId)?.parentId ?? null;
  while (parentId && !ancestors.has(parentId)) {
    ancestors.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
};

const withProjectFolderId = (project: ProjectEntry, folderId: string | null): ProjectEntry => {
  if (folderId) return { ...project, folderId };
  const next = { ...project };
  delete next.folderId;
  return next;
};

export const forgetClosedProjectArtifacts = (project: ProjectEntry): void => {  const normalizedPath = project.path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const folderRoot = normalizePath(project.path);
  if (folderRoot) {
    const worktreeScopes = (useSessionUIStore.getState().availableWorktreesByProject.get(normalizedPath) ?? [])
      .flatMap((worktree) => normalizePath(worktree.path) ?? []);
    useSessionFoldersStore.getState().forgetScopes([folderRoot, getArchivedScopeKey(folderRoot), ...worktreeScopes]);
  }
  useSessionUIStore.setState((s) => {
    const next = new Map(s.availableWorktreesByProject);
    next.delete(normalizedPath);
    return { availableWorktreesByProject: next };
  });
  const label = project.label?.trim() || project.path.split('/').pop() || project.path;
  void import('@/lib/spaces/space-close').then(({ stopSpacesOfClosedProject }) => stopSpacesOfClosedProject(project.path, label));
};

export const resolveIncomingProjectFolders = (
  settings: DesktopSettings,
  incomingProjects: ProjectEntry[],
  current: FolderSliceState,
): ProjectFolder[] => {
  // SAFETY: older documents predate the key, so presence is feature-detected with Array.isArray below.
  const hasFolderKey = Array.isArray((settings as { projectFolders?: unknown }).projectFolders);
  const incomingFolders = hasFolderKey
    ? parseProjectFolders(settings.projectFolders ?? [], settings) ?? []
    : current.projectFolders;
  const incomingFolderIds = new Set(incomingFolders.map((folder) => folder.id));
  for (const project of incomingProjects) {
    if (project.folderId && !incomingFolderIds.has(project.folderId)) {
      delete project.folderId;
    }
  }
  if (!hasFolderKey) {
    const currentFolderById = new Map(current.projects.map((entry) => [entry.id, entry.folderId ?? null]));
    for (const project of incomingProjects) {
      const kept = currentFolderById.get(project.id);
      if (kept && incomingFolderIds.has(kept)) {
        project.folderId = kept;
      }
    }
  }
  return incomingFolders;
};

export const persistProjects = (
  projects: ProjectEntry[],
  activeProjectId: string | null,
  manualOrder: string[] | undefined,
  projectFolders: ProjectFolder[] | undefined,
  helpers: Pick<FolderSliceHelpers, 'persistManualProjectOrder' | 'cacheProjects'>,
): void => {
  helpers.cacheProjects(projects, activeProjectId);
  if (manualOrder) {
    helpers.persistManualProjectOrder(manualOrder);
  }
  if (projectFolders) {
    persistProjectFolders(projectFolders);
  }
  const changes: Partial<DesktopSettings> = {
    projects,
    activeProjectId: activeProjectId ?? undefined,
  };
  if (projectFolders) {
    changes.projectFolders = projectFolders;
  }
  void updateDesktopSettings(changes);
};

export const createProjectFolderSlice = (
  set: StoreApi<ProjectsStore>['setState'],
  get: StoreApi<ProjectsStore>['getState'],
  helpers: FolderSliceHelpers,
) => ({
  addProjectFolder: (name: string, parentId?: string | null) => {
    if (helpers.isVSCode) {
      return null;
    }
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) {
      return null;
    }
    const targetParent = parentId ?? null;
    const { projects, activeProjectId, projectFolders } = get();
    if (targetParent && !projectFolders.some((folder) => folder.id === targetParent)) {
      return null;
    }
    const now = Date.now();
    const folder: ProjectFolder = {
      id: createProjectFolderId(),
      name: trimmed,
      parentId: targetParent,
      createdAt: now,
      updatedAt: now,
    };
    const nextFolders = [...projectFolders, folder];
    set({ projectFolders: nextFolders });
    persistProjectFolders(nextFolders);
    persistProjects(projects, activeProjectId, get().manualProjectOrder, nextFolders, helpers);
    return folder;
  },

  renameProjectFolder: (id: string, name: string) => {
    if (helpers.isVSCode) {
      return false;
    }
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) {
      return false;
    }
    const { projects, activeProjectId, projectFolders } = get();
    if (!projectFolders.some((folder) => folder.id === id)) {
      return false;
    }
    const nextFolders = projectFolders.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed, updatedAt: Date.now() } : folder,
    );
    set({ projectFolders: nextFolders });
    persistProjectFolders(nextFolders);
    persistProjects(projects, activeProjectId, get().manualProjectOrder, nextFolders, helpers);
    return true;
  },

  moveProjectFolder: (id: string, parentId: string | null, toIndex?: number) => {
    if (helpers.isVSCode) {
      return false;
    }
    const { projects, activeProjectId, projectFolders } = get();
    const folder = projectFolders.find((entry) => entry.id === id);
    if (!folder) {
      return false;
    }
    const targetParent = parentId ?? null;
    if (targetParent === id || (targetParent !== null && folderAncestorIds(projectFolders, targetParent).has(id))) {
      return false;
    }
    if (targetParent && !projectFolders.some((entry) => entry.id === targetParent)) {
      return false;
    }
    const rest = projectFolders.filter((entry) => entry.id !== id);
    const siblings = rest.filter((entry) => (entry.parentId ?? null) === targetParent);
    const insertAt = toIndex === undefined ? siblings.length : Math.max(0, Math.min(toIndex, siblings.length));
    const moved: ProjectFolder = { ...folder, parentId: targetParent, updatedAt: Date.now() };
    const nextFolders: ProjectFolder[] = [];
    let placed = false;
    for (const entry of rest) {
      if (!placed && (entry.parentId ?? null) === targetParent && siblings.indexOf(entry) === insertAt) {
        nextFolders.push(moved);
        placed = true;
      }
      nextFolders.push(entry);
    }
    if (!placed) {
      nextFolders.push(moved);
    }
    set({ projectFolders: nextFolders });
    persistProjectFolders(nextFolders);
    persistProjects(projects, activeProjectId, get().manualProjectOrder, nextFolders, helpers);
    return true;
  },

  deleteProjectFolder: (id: string, mode: 'move' | 'close', targetFolderId?: string | null) => {
    if (helpers.isVSCode) {
      return { moved: 0, closed: 0 };
    }
    const { projects, activeProjectId, projectFolders } = get();
    const folder = projectFolders.find((entry) => entry.id === id);
    if (!folder) {
      return { moved: 0, closed: 0 };
    }
    const subtreeIds = collectFolderSubtreeIds(projectFolders, id);
    const target = mode === 'move' ? targetFolderId ?? null : null;
    if (target && (target === id || subtreeIds.has(target))) {
      return { moved: 0, closed: 0 };
    }
    if (target && !projectFolders.some((entry) => entry.id === target)) {
      return { moved: 0, closed: 0 };
    }
    const reparentTo = mode === 'move' ? target : folder.parentId;
    const keptFolders = projectFolders
      .filter((entry) => entry.id !== id)
      .map((entry) => (entry.parentId === id
        ? { ...entry, parentId: reparentTo, updatedAt: Date.now() }
        : entry));
    const directMembers = projects.filter((project) => project.folderId === id);
    if (mode === 'close') {
      const closingIds = new Set(directMembers.map((project) => project.id));
      const nextProjects = projects.filter((project) => !closingIds.has(project.id));
      const nextActiveId = activeProjectId && closingIds.has(activeProjectId)
        ? nextProjects[0]?.id ?? null
        : activeProjectId;
      const nextManualOrder = get().manualProjectOrder.filter((entry) => !closingIds.has(entry));
      set({ projects: nextProjects, activeProjectId: nextActiveId, manualProjectOrder: nextManualOrder, projectFolders: keptFolders });
      persistProjectFolders(keptFolders);
      persistProjects(nextProjects, nextActiveId, nextManualOrder, keptFolders, helpers);
      for (const project of directMembers) {
        forgetClosedProjectArtifacts(project);
      }
      if (nextActiveId) {
        const nextActive = nextProjects.find((project) => project.id === nextActiveId);
        if (nextActive) {
          opencodeClient.setDirectory(nextActive.path);
          useDirectoryStore.getState().setDirectory(nextActive.path, { showOverlay: false });
        }
      } else {
        void useDirectoryStore.getState().goToNoProjectDirectory();
      }
      return { moved: 0, closed: directMembers.length };
    }
    const nextProjects = projects.map((project) =>
      project.folderId === id ? withProjectFolderId(project, target) : project,
    );
    set({ projects: nextProjects, projectFolders: keptFolders });
    persistProjectFolders(keptFolders);
    persistProjects(nextProjects, activeProjectId, get().manualProjectOrder, keptFolders, helpers);
    return { moved: directMembers.length, closed: 0 };
  },

  moveProjectToFolder: (projectId: string, folderId: string | null) => {
    if (helpers.isVSCode) {
      return false;
    }
    const { projects, activeProjectId, projectFolders } = get();
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) {
      return false;
    }
    if (folderId && !projectFolders.some((folder) => folder.id === folderId)) {
      return false;
    }
    if ((project.folderId ?? null) === folderId) {
      return true;
    }
    const nextProjects = projects.map((entry) =>
      entry.id === projectId ? withProjectFolderId(entry, folderId) : entry,
    );
    set({ projects: nextProjects });
    persistProjects(nextProjects, activeProjectId, get().manualProjectOrder, projectFolders, helpers);
    return true;
  },

  restoreProjectTree: (snapshot: ProjectTreeSnapshot) => {
    if (helpers.isVSCode) {
      return;
    }
    const folders = parseProjectFolders(snapshot.projectFolders, {}) ?? [];
    const folderIds = new Set(folders.map((folder) => folder.id));
    const validProjects = snapshot.projects.filter((project) => project.path && project.id);
    const nextProjects = validProjects.map((project) => {
      const kept = project.folderId && folderIds.has(project.folderId) ? project.folderId : null;
      return withProjectFolderId(project, kept);
    });
    const nextIds = new Set(nextProjects.map((project) => project.id));
    const activeProjectId = (snapshot.activeProjectId && nextIds.has(snapshot.activeProjectId))
      ? snapshot.activeProjectId
      : (nextProjects.some((project) => project.id === get().activeProjectId)
        ? get().activeProjectId
        : nextProjects[0]?.id ?? null);
    const snapshotOrder = (snapshot.manualProjectOrder ?? []).filter((id) => nextIds.has(id));
    const orderedIds = [...snapshotOrder, ...nextProjects.map((project) => project.id).filter((id) => !snapshotOrder.includes(id))];
    set({ projects: nextProjects, projectFolders: folders, activeProjectId, manualProjectOrder: orderedIds });
    persistProjectFolders(folders);
    helpers.persistManualProjectOrder(orderedIds);
    persistProjects(nextProjects, activeProjectId, orderedIds, folders, helpers);
  },
});
