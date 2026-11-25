import React from 'react';
import type { Project as OpenCodeProject, Session } from '@/lib/opencode/model';
import { getSettingsSurface } from '@/lib/settings/surface';
import { useSidebarSpaces } from '@/lib/spaces/spaces-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useGlobalSyncStore } from '@/sync/global-sync-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { ProjectEntry } from '@/lib/api/types';
import type { WorktreeMetadata } from '@/types/worktree';
import type { ReadOnlySessionAssociation } from '@/lib/worktrees/readOnlySessionAssociation';
import { createSessionOwnershipIndex } from '../sessions/sessionOwnership';
import { normalizePath } from '../utils';
import { partitionSidebarSessions } from './sessionCollection';
import { isActivityRankedOrder, orderByProjectRank, rankByLatestActivity, sortProjectsByOrder } from './projectSort';

const NO_PROJECTS: ProjectEntry[] = [];
const NO_IDS: string[] = [];
const NO_SESSIONS: Session[] = [];
const NO_WORKTREES = new Map<string, WorktreeMetadata[]>();
const NO_OPENCODE_PROJECTS: OpenCodeProject[] = [];
const NO_NESTED_OWNERS: ReadonlyMap<string, ReadOnlySessionAssociation> = new Map();

export const useProjectsInSidebarOrder = <T extends { id: string }>(
  items: readonly T[],
  enabled = true,
): readonly T[] => {
  const isVSCode = React.useMemo(() => getSettingsSurface() === 'vscode', []);
  const projects = useProjectsStore((state) => (enabled ? state.projects : NO_PROJECTS));
  const manualOrder = useProjectsStore((state) => (enabled ? state.manualProjectOrder : NO_IDS));
  const order = useSessionDisplayStore((state) => state.projectSortOrder);
  const activityRanked = enabled && isActivityRankedOrder(order);
  const sessions = useGlobalSessionsStore((state) => (activityRanked ? state.activeSessions : NO_SESSIONS));
  const archivedSessions = useGlobalSessionsStore((state) => (activityRanked ? state.archivedSessions : NO_SESSIONS));
  const worktrees = useSessionUIStore((state) => (activityRanked ? state.availableWorktreesByProject : NO_WORKTREES));
  const openCodeProjects = useGlobalSyncStore((state) => (activityRanked ? state.projects : NO_OPENCODE_PROJECTS));
  const nestedSessionOwners = useSessionUIStore((state) => (activityRanked ? state.nestedSessionOwners : NO_NESTED_OWNERS));
  const spaces = useSidebarSpaces(activityRanked);

  const orderKey = React.useMemo(() => {
    const sorted = sortProjectsByOrder(projects, order, manualOrder);
    const ranked = activityRanked
      ? rankByLatestActivity(sorted, order, (project) => project.id, createSessionOwnershipIndex(
        partitionSidebarSessions(sessions, isVSCode).projectSessions,
        sorted.flatMap((project) => {
          const normalizedPath = normalizePath(project.path);
          return normalizedPath ? [{ id: project.id, normalizedPath }] : [];
        }),
        worktrees,
        isVSCode,
        archivedSessions,
        openCodeProjects,
        spaces,
        nestedSessionOwners,
      ).sessionsByProject)
      : sorted;
    return ranked.map((project) => project.id).join('\n');
  }, [activityRanked, archivedSessions, isVSCode, manualOrder, nestedSessionOwners, openCodeProjects, order, projects, sessions, spaces, worktrees]);
  const rankById = React.useMemo(
    () => new Map(orderKey.split('\n').map((id, index) => [id, index])),
    [orderKey],
  );
  const ordered = React.useMemo(
    () => (enabled ? orderByProjectRank(items, rankById) : null),
    [enabled, items, rankById],
  );

  const shownRef = React.useRef<{ items: readonly T[]; ordered: readonly T[] } | null>(null);
  if (ordered) {
    shownRef.current = { items, ordered };
    return ordered;
  }
  return shownRef.current?.items === items ? shownRef.current.ordered : items;
};
