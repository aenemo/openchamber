import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';

type ProjectDropAction =
  | { kind: 'move-to-folder'; folderId: string | null }
  | { kind: 'reorder'; from: number; to: number }
  | null;

type ProjectDropInput = {
  activeId: string;
  overId: string;
  projectIds: readonly string[];
  folderIdByProjectId: ReadonlyMap<string, string | null>;
  folderRowsPresent: boolean;
  sortOrder: ProjectSortOrder;
};

export const resolveProjectDropAction = ({
  activeId,
  overId,
  projectIds,
  folderIdByProjectId,
  folderRowsPresent,
  sortOrder,
}: ProjectDropInput): ProjectDropAction => {
  if (sortOrder !== 'manual') return null;
  const from = projectIds.indexOf(activeId);
  const to = projectIds.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const fromFolderId = folderIdByProjectId.get(activeId) ?? null;
  const toFolderId = folderIdByProjectId.get(overId) ?? null;
  if (folderRowsPresent && fromFolderId !== toFolderId) return { kind: 'move-to-folder', folderId: toFolderId };
  return { kind: 'reorder', from, to };
};
