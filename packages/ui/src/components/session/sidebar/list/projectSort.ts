import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import type { I18nKey } from '@/lib/i18n';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { updateDesktopSettings } from '@/lib/persistence';

export const PROJECT_SORT_ORDERS = [
  'manual',
  'a-z',
  'z-a',
  'date-added',
  'recent',
  'least-recent',
] as const satisfies ReadonlyArray<ProjectSortOrder>;

export const PROJECT_SORT_LABEL_KEYS = {
  manual: 'sessions.sidebar.header.projectSort.manual',
  'a-z': 'sessions.sidebar.header.projectSort.aToZ',
  'z-a': 'sessions.sidebar.header.projectSort.zToA',
  'date-added': 'sessions.sidebar.header.projectSort.dateAdded',
  recent: 'sessions.sidebar.header.projectSort.recent',
  'least-recent': 'sessions.sidebar.header.projectSort.leastRecent',
} as const satisfies Record<ProjectSortOrder, I18nKey>;

export const PROJECT_SORT_CHOICES = PROJECT_SORT_ORDERS.map(
  (order) => [order, PROJECT_SORT_LABEL_KEYS[order]] as const,
);

type SortableProject = {
  id: string;
  label?: string | null;
  path: string;
  addedAt?: number | null;
  lastOpenedAt?: number | null;
};

const compareLabels = (left: SortableProject, right: SortableProject): number =>
  (left.label || left.path).toLowerCase().localeCompare((right.label || right.path).toLowerCase());

export const sortProjectsByOrder = <T extends SortableProject>(
  projects: readonly T[],
  order: ProjectSortOrder,
  manualOrder: readonly string[],
): T[] => {
  const sorted = [...projects];

  switch (order) {
    case 'a-z':
      sorted.sort(compareLabels);
      break;
    case 'z-a':
      sorted.sort((left, right) => compareLabels(right, left));
      break;
    case 'date-added':
      sorted.sort((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0));
      break;
    case 'recent':
      sorted.sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0));
      break;
    case 'least-recent':
      sorted.sort((left, right) => (left.lastOpenedAt ?? 0) - (right.lastOpenedAt ?? 0));
      break;
    case 'manual': {
      const rankById = new Map(manualOrder.map((id, index) => [id, index]));
      sorted.sort((left, right) => (rankById.get(left.id) ?? Infinity) - (rankById.get(right.id) ?? Infinity));
      break;
    }
  }

  return sorted;
};

export const parseProjectSortOrder = (value: string): ProjectSortOrder | null =>
  PROJECT_SORT_ORDERS.find((order) => order === value) ?? null;

export const defaultPersistProjectSortOrder = (order: ProjectSortOrder): void => {
  void updateDesktopSettings({ sidebarProjectSortOrder: order });
};

export const applyProjectSortOrder = (
  value: string,
  persist: (order: ProjectSortOrder) => void = defaultPersistProjectSortOrder,
): boolean => {
  const next = parseProjectSortOrder(value);
  if (!next) return false;
  useSessionDisplayStore.getState().setProjectSortOrder(next);
  persist(next);
  return true;
};

export const isActivityRankedOrder = (order: ProjectSortOrder): boolean =>
  order === 'recent' || order === 'least-recent';

export const rankByLatestActivity = <T>(
  items: readonly T[],
  order: ProjectSortOrder,
  projectIdOf: (item: T) => string,
  sessionsByProject: ReadonlyMap<string, ReadonlyArray<{ time: { updated: number } }>>,
): readonly T[] => {
  if (!isActivityRankedOrder(order)) return items;
  const latest = (item: T): number => {
    let newest = 0;
    for (const session of sessionsByProject.get(projectIdOf(item)) ?? []) {
      if (session.time.updated > newest) newest = session.time.updated;
    }
    return newest;
  };
  const ranked = items.map((item) => ({ item, at: latest(item) }));
  ranked.sort((left, right) => order === 'recent' ? right.at - left.at : left.at - right.at);
  return ranked.map((entry) => entry.item);
};

export const orderByProjectRank = <T extends { id: string }>(
  items: readonly T[],
  rankById: ReadonlyMap<string, number>,
): T[] => {
  const rankOf = (item: T): number => rankById.get(item.id) ?? -1;
  return [...items].sort((left, right) => rankOf(left) - rankOf(right));
};

export const holdOrder = <T>(
  items: readonly T[],
  heldIds: readonly string[],
  idOf: (item: T) => string,
): readonly T[] => {
  const rank = new Map(heldIds.map((id, index) => [id, index]));
  const held: T[] = [];
  const fresh: T[] = [];
  for (const item of items) {
    (rank.has(idOf(item)) ? held : fresh).push(item);
  }
  held.sort((left, right) => (rank.get(idOf(left)) ?? 0) - (rank.get(idOf(right)) ?? 0));
  return [...held, ...fresh];
};
