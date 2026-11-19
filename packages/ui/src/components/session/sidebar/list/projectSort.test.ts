import { describe, expect, test } from 'bun:test';

import { holdOrder, parseProjectSortOrder, rankByLatestActivity, sortProjectsByOrder, applyProjectSortOrder, PROJECT_SORT_CHOICES, PROJECT_SORT_ORDERS } from './projectSort';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';

const projects = [
  { id: 'beta', label: 'Beta', path: '/repos/beta', addedAt: 300, lastOpenedAt: 100 },
  { id: 'alpha', label: 'alpha', path: '/repos/alpha', addedAt: 100, lastOpenedAt: 300 },
  { id: 'gamma', label: null, path: '/repos/gamma', addedAt: 200, lastOpenedAt: 200 },
];

const ids = (list: ReadonlyArray<{ id: string }>): string[] => list.map((project) => project.id);

describe('sortProjectsByOrder', () => {
  // A label-less project compares by its whole path, so it sorts under '/'.
  // Both surfaces fill the label in before rendering; this only pins the
  // fallback down.
  test('orders by label case-insensitively, falling back to the path', () => {
    expect(ids(sortProjectsByOrder(projects, 'a-z', []))).toEqual(['gamma', 'alpha', 'beta']);
    expect(ids(sortProjectsByOrder(projects, 'z-a', []))).toEqual(['beta', 'alpha', 'gamma']);
  });

  test('puts the newest first for date-added and the most recently opened first for recent', () => {
    expect(ids(sortProjectsByOrder(projects, 'date-added', []))).toEqual(['beta', 'gamma', 'alpha']);
    expect(ids(sortProjectsByOrder(projects, 'recent', []))).toEqual(['alpha', 'gamma', 'beta']);
    expect(ids(sortProjectsByOrder(projects, 'least-recent', []))).toEqual(['beta', 'gamma', 'alpha']);
  });

  test('follows the manual order and keeps unlisted projects at the end', () => {
    expect(ids(sortProjectsByOrder(projects, 'manual', ['gamma', 'alpha']))).toEqual(['gamma', 'alpha', 'beta']);
  });

  test('treats a missing timestamp as the oldest', () => {
    const withoutStamps = [{ id: 'none', path: '/repos/none' }, ...projects];
    expect(ids(sortProjectsByOrder(withoutStamps, 'recent', []))).toEqual(['alpha', 'gamma', 'beta', 'none']);
    expect(ids(sortProjectsByOrder(withoutStamps, 'least-recent', []))).toEqual(['none', 'beta', 'gamma', 'alpha']);
  });
});

describe('rankByLatestActivity', () => {
  const sessions = new Map([
    ['a', [{ time: { updated: 10 } }, { time: { updated: 40 } }]],
    ['b', [{ time: { updated: 30 } }]],
  ]);
  const projects = [{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'b' }];

  test('puts the project with the newest session first, idle ones after in incoming order', () => {
    expect(rankByLatestActivity(projects, 'recent', (p) => p.id, sessions).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('puts the project with the oldest session first for least-recent, idle ones first in incoming order', () => {
    expect(rankByLatestActivity(projects, 'least-recent', (p) => p.id, sessions).map((p) => p.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  test('leaves every other sort alone', () => {
    expect(rankByLatestActivity(projects, 'a-z', (p) => p.id, sessions)).toBe(projects);
  });
});

describe('parseProjectSortOrder', () => {
  test('accepts every known order and rejects the rest', () => {
    expect(parseProjectSortOrder('manual')).toBe('manual');
    expect(parseProjectSortOrder('a-z')).toBe('a-z');
    expect(parseProjectSortOrder('z-a')).toBe('z-a');
    expect(parseProjectSortOrder('date-added')).toBe('date-added');
    expect(parseProjectSortOrder('recent')).toBe('recent');
    expect(parseProjectSortOrder('least-recent')).toBe('least-recent');
    expect(parseProjectSortOrder('random')).toBeNull();
    expect(parseProjectSortOrder('')).toBeNull();
  });
});

describe('applyProjectSortOrder', () => {
  test('stores and persists known orders through the given write and ignores the rest', async () => {
    const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
    const calls: ProjectSortOrder[] = [];
    useSessionDisplayStore.setState({ projectSortOrder: 'manual' });
    expect(applyProjectSortOrder('least-recent', (order) => { calls.push(order); })).toBe(true);
    expect(useSessionDisplayStore.getState().projectSortOrder).toBe('least-recent');
    expect(calls).toEqual(['least-recent']);
    expect(applyProjectSortOrder('random', (order) => { calls.push(order); })).toBe(false);
    expect(useSessionDisplayStore.getState().projectSortOrder).toBe('least-recent');
    expect(calls.length).toBe(1);
  });
});

describe('PROJECT_SORT_CHOICES', () => {
  test('exposes every order once with its label', () => {
    expect(PROJECT_SORT_CHOICES.map(([order]) => order)).toEqual([...PROJECT_SORT_ORDERS]);
    const labels = new Set(PROJECT_SORT_CHOICES.map(([, labelKey]) => labelKey));
    expect(labels.size).toBe(PROJECT_SORT_CHOICES.length);
  });
});

describe('holdOrder', () => {
  test('keeps the shown order and appends projects that appeared since', () => {
    const live = [{ id: 'b' }, { id: 'new' }, { id: 'a' }, { id: 'c' }];
    expect(holdOrder(live, ['a', 'b', 'c', 'gone'], (p) => p.id).map((p) => p.id)).toEqual(['a', 'b', 'c', 'new']);
  });
});
