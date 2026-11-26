import type { SessionGroup } from './types';
import type { ProjectSection } from './projects/sessionProjectRender';
import { buildGroupRenderDescriptors, type GroupRenderDescriptor } from './projects/sessionProjectRender';
import { buildProjectFolderTree, type ProjectFolder, type ProjectFolderNode } from '@/lib/projectFolders/tree';
import { isGroupWork } from './works/sidebarWorks';
import type {
  GroupPlacement,
  SessionSidebarRow,
  SessionSidebarStickyHeader,
  WorktreeInFolder,
} from './sessionSidebarRowModel';

export type ProjectsCaption = {
  key: 'projects' | `section:${string}`;
  label?: string;
  preview?: boolean;
  always: boolean;
};

type ProjectFolderRowsHost = {
  args: {
    showOnlyMainWorkspace: boolean;
    singleProjectMode: boolean;
    collapsedProjects: ReadonlySet<string>;
    collapsedActivities: ReadonlySet<string>;
    collapsedProjectFolders?: ReadonlyArray<string> | ReadonlySet<string> | undefined;
    projectFolders?: readonly ProjectFolder[] | undefined;
    projectFolderIdByProjectId?: ReadonlyMap<string, string | null> | undefined;
  };
  rows: readonly SessionSidebarRow[];
  push: (row: SessionSidebarRow) => void;
  stickyHeaders: SessionSidebarStickyHeader[];
  sectionHeaderEstimateSize: number;
  projectsCaptionCollapseKey: string;
  projectPlacement: GroupPlacement;
  movedGroupKeys: ReadonlySet<string>;
  collectFiledWorktrees: (descriptors: GroupRenderDescriptor[]) => Map<string, WorktreeInFolder>;
  appendGroup: (
    group: SessionGroup,
    groupKey: string,
    projectId: string | null,
    hideHeader: boolean,
    limits: undefined,
    placement: GroupPlacement,
    worktreesByMemberId: ReadonlyMap<string, WorktreeInFolder> | undefined,
    listedWorktrees?: readonly WorktreeInFolder[],
  ) => void;
};
export const appendProjectsCaption = (host: ProjectFolderRowsHost, caption: ProjectsCaption): boolean => {
  const collapseKey = caption.key === 'projects' ? host.projectsCaptionCollapseKey : caption.key;
  const captionCollapsed = host.args.collapsedActivities.has(collapseKey);
  host.push({
    kind: 'caption',
    key: `caption:${caption.key}`,
    estimateSize: host.sectionHeaderEstimateSize,
    caption: caption.key,
    collapsed: captionCollapsed,
    label: caption.label,
    preview: caption.preview,
  });
  return captionCollapsed;
};

export const appendProjectSectionRows = (host: ProjectFolderRowsHost, section: ProjectSection, depth = 0): void => {
  const descriptors = buildGroupRenderDescriptors(section, { mainWorkspaceOnly: host.args.showOnlyMainWorkspace });
  const projectCollapsed = !host.args.singleProjectMode
    && !host.args.showOnlyMainWorkspace
    && host.args.collapsedProjects.has(section.project.id);
  const projectDepth = Math.min(Math.max(depth, 0), 8);
  const placement: GroupPlacement = { ...host.projectPlacement, depth: host.projectPlacement.depth + projectDepth };
  if (!host.args.showOnlyMainWorkspace) {
    const rowIndex = host.rows.length;
    host.push({
      kind: 'project-header',
      key: `project:${section.project.id}:header`,
      estimateSize: host.sectionHeaderEstimateSize,
      section,
      collapsed: projectCollapsed,
      depth: projectDepth,
    });
    host.stickyHeaders.push(Object.freeze({ rowIndex, kind: 'project', id: section.project.id }));
  }
  if (projectCollapsed) return;
  const worktreesByMemberId = host.collectFiledWorktrees(descriptors);
  const filedGroupKeys = new Set([...worktreesByMemberId.values()].map((entry) => entry.groupKey));
  const hasRootGroup = descriptors.some((descriptor) => descriptor.group.isMain);
  const listedWorktrees = hasRootGroup ? descriptors
    .filter((descriptor) => isGroupWork(descriptor.group)
      && !host.movedGroupKeys.has(descriptor.groupKey) && !filedGroupKeys.has(descriptor.groupKey))
    .map((descriptor): WorktreeInFolder => ({ group: descriptor.group, groupKey: descriptor.groupKey })) : [];
  const listedGroupKeys = new Set(listedWorktrees.map((entry) => entry.groupKey));
  for (const descriptor of descriptors) {
    if (host.movedGroupKeys.has(descriptor.groupKey) || filedGroupKeys.has(descriptor.groupKey) || listedGroupKeys.has(descriptor.groupKey)) continue;
    host.appendGroup(
      descriptor.group,
      descriptor.groupKey,
      descriptor.projectId,
      descriptor.hideGroupLabel,
      undefined,
      placement,
      descriptor.group.isMain ? worktreesByMemberId : undefined,
      descriptor.group.isMain ? listedWorktrees : undefined,
    );
  }
};
const countSubtreeProjects = (
  sectionsByFolderId: ReadonlyMap<string | null, readonly ProjectSection[]>,
  node: ProjectFolderNode,
): number => (
  (sectionsByFolderId.get(node.folder.id)?.length ?? 0)
  + node.children.reduce((total, child) => total + countSubtreeProjects(sectionsByFolderId, child), 0)
);

const folderedProjectSections = (
  host: Pick<ProjectFolderRowsHost, 'args'>,
  projectSections: readonly ProjectSection[],
): { roots: readonly ProjectFolderNode[]; sectionsByFolderId: Map<string | null, ProjectSection[]> } | null => {
  const folders = host.args.projectFolders ?? [];
  if (folders.length === 0 || host.args.singleProjectMode || host.args.showOnlyMainWorkspace) return null;
  const folderIds = new Set(folders.map((folder) => folder.id));
  const sectionsByFolderId = new Map<string | null, ProjectSection[]>();
  const folderIdByProjectId = host.args.projectFolderIdByProjectId;
  for (const section of projectSections) {
    const folderId = folderIdByProjectId?.get(section.project.id) ?? null;
    const key = folderId && folderIds.has(folderId) ? folderId : null;
    const bucket = sectionsByFolderId.get(key) ?? [];
    bucket.push(section);
    sectionsByFolderId.set(key, bucket);
  }
  const collapsed = new Set<string>();
  for (const id of host.args.collapsedProjectFolders ?? []) {
    if (folderIds.has(id)) collapsed.add(id);
  }
  return { roots: buildProjectFolderTree(folders, collapsed), sectionsByFolderId };
};

const appendFolderedProjectSections = (
  host: ProjectFolderRowsHost,
  folderRoots: readonly ProjectFolderNode[],
  sectionsByFolderId: ReadonlyMap<string | null, readonly ProjectSection[]>,
): void => {
  const emitFolderNode = (node: ProjectFolderNode): void => {
    const members = sectionsByFolderId.get(node.folder.id) ?? [];
    host.push({
      kind: 'project-folder-header',
      key: `project-folder:${node.folder.id}:header`,
      estimateSize: host.sectionHeaderEstimateSize,
      folder: node.folder,
      depth: Math.min(node.depth, 8),
      collapsed: node.collapsed,
      projectCount: countSubtreeProjects(sectionsByFolderId, node),
    });
    if (node.collapsed) return;
    for (const section of members) appendProjectSectionRows(host, section, node.depth + 1);
    for (const child of node.children) emitFolderNode(child);
  };
  for (const root of folderRoots) emitFolderNode(root);
  for (const section of sectionsByFolderId.get(null) ?? []) appendProjectSectionRows(host, section, 0);
};

export const appendMaybeFolderedProjectSections = (
  host: ProjectFolderRowsHost,
  projectSections: readonly ProjectSection[],
  caption: ProjectsCaption,
): boolean => {
  const foldered = caption.key === 'projects' && !caption.always
    ? folderedProjectSections(host, projectSections)
    : null;
  if (!foldered) return false;
  appendFolderedProjectSections(host, foldered.roots, foldered.sectionsByFolderId);
  return true;
};
