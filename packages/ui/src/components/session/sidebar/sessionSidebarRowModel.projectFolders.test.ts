import { describe, expect, test } from 'bun:test';
import type { SessionGroup, SessionNode } from './types';
import type { ProjectSection } from './projects/sessionProjectRender';
import type { ProjectFolder } from '@/lib/projectFolders/tree';
import { buildSessionSidebarRowModel, type SessionSidebarRowModelArgs } from './sessionSidebarRowModel';

const node = (id: string): SessionNode => ({
  // SAFETY: the row model reads only the session id, title, directory and time below.
  session: { id, title: id, directory: '/repo', time: { created: 1, updated: 1 } } as never,
  children: [],
  worktree: null,
});

const mainGroup = (directory: string): SessionGroup => ({
  id: 'main',
  label: 'main',
  branch: null,
  description: null,
  isMain: true,
  worktree: null,
  directory,
  folderScopeKey: directory,
  sessions: [node(`s-${directory}`)],
});

const section = (id: string, path: string): ProjectSection => ({
  project: { id, normalizedPath: path },
  groups: [mainGroup(path)],
});

const baseArgs = (sections: ProjectSection[]): SessionSidebarRowModelArgs => ({
  mode: 'normal',
  sections,
  authoritativeSections: sections,
  chatGroup: null,
  foldersMap: {},
  collapsedProjects: new Set(),
  collapsedGroups: new Set(),
  collapsedFolders: new Set(),
  collapsedActivities: new Set(),
  expandedParents: new Set(),
  visibleCountByContainer: new Map(),
  pinnedSessionIds: new Set(),
  sessionOrderIndex: new Map(),
  groupStatusByKey: new Map(),
  folderAuthorityByOwner: new Map(),
  sessionOwnerById: new Map(),
  activeProjectId: null,
  singleProjectMode: false,
  singleProjectId: null,
  showOnlyMainWorkspace: false,
  hideDirectoryControls: false,
  projectsCaption: true,
  projectsCaptionAtTop: true,
  blocks: [{ kind: 'projects' }],
});

const folder = (id: string, parentId: string | null = null): ProjectFolder => ({
  id, name: id, parentId, createdAt: 0, updatedAt: 0,
});

const rowKinds = (args: SessionSidebarRowModelArgs): string[] =>
  buildSessionSidebarRowModel(args).rows.flatMap((row) => {
    if (row.kind === 'project-folder-header') return [`folder:${row.folder.id}:${row.collapsed ? 'closed' : 'open'}`];
    if (row.kind === 'project-header') return [`project:${row.section.project.id}`];
    if (row.kind === 'caption') return ['caption'];
    return [];
  });

describe('project folder rows', () => {
  test('groups projects under folder headers in folder order with ungrouped projects last', () => {
    const sections = [section('p1', '/one'), section('p2', '/two'), section('p3', '/three')];
    const args: SessionSidebarRowModelArgs = {
      ...baseArgs(sections),
      projectFolders: [folder('clients'), folder('infra', 'clients')],
      collapsedProjectFolders: new Set(),
      projectFolderIdByProjectId: new Map([['p1', 'infra'], ['p3', 'clients']]),
    };

    expect(rowKinds(args)).toEqual([
      'caption',
      'folder:clients:open',
      'project:p3',
      'folder:infra:open',
      'project:p1',
      'project:p2',
    ]);
    const counts = new Map(
      buildSessionSidebarRowModel(args).rows.flatMap((row) => (
        row.kind === 'project-folder-header' ? [[row.folder.id, row.projectCount] as const] : []
      )),
    );
    expect(counts.get('clients')).toBe(2);
    expect(counts.get('infra')).toBe(1);
  });

  test('a collapsed folder hides its members and subfolders', () => {
    const sections = [section('p1', '/one'), section('p2', '/two')];
    const args: SessionSidebarRowModelArgs = {
      ...baseArgs(sections),
      projectFolders: [folder('clients'), folder('infra', 'clients')],
      collapsedProjectFolders: new Set(['clients']),
      projectFolderIdByProjectId: new Map([['p1', 'infra'], ['p2', 'clients']]),
    };

    expect(rowKinds(args)).toEqual(['caption', 'folder:clients:closed']);
  });

  test('projects linked to unknown folders stay at the root', () => {
    const sections = [section('p1', '/one')];
    const args: SessionSidebarRowModelArgs = {
      ...baseArgs(sections),
      projectFolders: [folder('clients')],
      collapsedProjectFolders: new Set(),
      projectFolderIdByProjectId: new Map([['p1', 'gone']]),
    };

    expect(rowKinds(args)).toEqual(['caption', 'folder:clients:open', 'project:p1']);
  });

  test('no folders keeps the flat project list', () => {
    const sections = [section('p1', '/one'), section('p2', '/two')];
    const args: SessionSidebarRowModelArgs = {
      ...baseArgs(sections),
      projectFolders: [],
      collapsedProjectFolders: new Set(),
      projectFolderIdByProjectId: new Map(),
    };

    expect(rowKinds(args)).toEqual(['caption', 'project:p1', 'project:p2']);
  });
});
