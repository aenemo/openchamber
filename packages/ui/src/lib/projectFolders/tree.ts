import type { ProjectEntry } from '@/lib/api/types';
import { pickDeterministicLeastUsedColor } from '@/lib/colorPresets';

export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ProjectFolderNode = {
  folder: ProjectFolder;
  depth: number;
  collapsed: boolean;
  children: ProjectFolderNode[];
};

export const buildProjectFolderTree = (
  folders: readonly ProjectFolder[],
  collapsedIds: ReadonlySet<string>,
): ProjectFolderNode[] => {
  const cleaned = folders.map((folder) => ({ ...folder }));
  const byId = new Map(cleaned.map((folder) => [folder.id, folder]));
  for (const folder of cleaned) {
    if (folder.parentId && !byId.has(folder.parentId)) folder.parentId = null;
  }
  for (const folder of cleaned) {
    const seen = new Set<string>([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (seen.has(parentId)) {
        folder.parentId = null;
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  const childrenByParent = new Map<string | null, ProjectFolder[]>();
  for (const folder of cleaned) {
    const parentId = folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(parentId, siblings);
  }
  const build = (id: string | null, depth: number): ProjectFolderNode[] => {
    const nodes: ProjectFolderNode[] = [];
    for (const folder of childrenByParent.get(id) ?? []) {
      nodes.push({
        folder,
        depth,
        collapsed: collapsedIds.has(folder.id),
        children: build(folder.id, depth + 1),
      });
    }
    return nodes;
  };
  return build(null, 0);
};

export const flattenProjectFolderTree = (roots: readonly ProjectFolderNode[]): ProjectFolderNode[] => {
  const flat: ProjectFolderNode[] = [];
  const visit = (node: ProjectFolderNode): void => {
    flat.push(node);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return flat;
};

export const projectFolderIdsInSubtree = (roots: readonly ProjectFolderNode[], rootId: string): Set<string> => {
  const ids = new Set<string>();
  const visit = (nodes: readonly ProjectFolderNode[], inside: boolean): void => {
    for (const node of nodes) {
      const nowInside = inside || node.folder.id === rootId;
      if (nowInside) ids.add(node.folder.id);
      visit(node.children, nowInside);
    }
  };
  visit(roots, false);
  return ids;
};

export const backfillTopLevelFolderColors = (
  folders: ProjectFolder[],
  projects: Pick<ProjectEntry, 'color'>[],
): ProjectFolder[] => {
  if (!folders.some((folder) => (folder.parentId ?? null) === null && !folder.color)) {
    return folders;
  }
  const usedColors: (string | null | undefined)[] = [
    ...projects.map((project) => project.color),
    ...folders.map((folder) => folder.color),
  ];
  return folders.map((folder) => {
    if ((folder.parentId ?? null) !== null || folder.color) {
      return folder;
    }
    const color = pickDeterministicLeastUsedColor(folder.id, usedColors);
    usedColors.push(color);
    return { ...folder, color };
  });
};
