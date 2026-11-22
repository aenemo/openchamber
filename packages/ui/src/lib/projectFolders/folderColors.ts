import type { ProjectEntry } from '@/lib/api/types';
import { backfillTopLevelFolderColors, type ProjectFolder } from './tree';
import { persistProjectFolders, readPersistedProjectFolders } from '@/stores/projectFolders';
import { updateDesktopSettings } from '@/lib/persistence';

export const loadInitialProjectFoldersWithBackfill = (projects: ProjectEntry[], isVSCode: boolean): ProjectFolder[] => {
  if (isVSCode) {
    return [];
  }
  const persisted = readPersistedProjectFolders();
  const backfilled = backfillTopLevelFolderColors(persisted, projects);
  if (backfilled !== persisted) {
    persistProjectFolders(backfilled);
  }
  return backfilled;
};

export const resolveSyncFoldersWithBackfill = (incomingFolders: ProjectFolder[], incomingProjects: ProjectEntry[]) => {
  const folders = backfillTopLevelFolderColors(incomingFolders, incomingProjects);
  return { folders, didBackfill: folders !== incomingFolders };
};

export const pushBackfilledFoldersForConvergence = (folders: ProjectFolder[]): void => {
  void updateDesktopSettings({ projectFolders: folders });
};
