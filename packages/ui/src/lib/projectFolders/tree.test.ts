import { describe, expect, test } from 'bun:test';
import type { ProjectFolder } from './tree';
import { buildProjectFolderTree, flattenProjectFolderTree, projectFolderIdsInSubtree } from './tree';

const folder = (id: string, parentId: string | null = null): ProjectFolder => ({
  id, name: id, parentId, createdAt: 0, updatedAt: 0,
});

describe('buildProjectFolderTree', () => {
  test('nests children under parents in array order with depths', () => {
    const tree = buildProjectFolderTree([
      folder('a'), folder('b', 'a'), folder('c'), folder('d', 'b'),
    ], new Set());

    expect(tree.map((node) => node.folder.id)).toEqual(['a', 'c']);
    expect(tree[0]?.children.map((node) => node.folder.id)).toEqual(['b']);
    expect(tree[0]?.children[0]?.children.map((node) => node.folder.id)).toEqual(['d']);
    expect(tree[0]?.depth).toBe(0);
    expect(tree[0]?.children[0]?.depth).toBe(1);
    expect(tree[0]?.children[0]?.collapsed).toBe(false);
  });

  test('marks collapsed folders and lifts orphans to the root', () => {
    const tree = buildProjectFolderTree([
      folder('a'), folder('orphan', 'gone'),
    ], new Set(['a']));

    expect(tree.map((node) => node.folder.id)).toEqual(['a', 'orphan']);
    expect(tree[0]?.collapsed).toBe(true);
    expect(tree[0]?.depth).toBe(0);
  });

  test('breaks parent cycles instead of recursing forever', () => {
    const tree = buildProjectFolderTree([
      folder('a', 'b'), folder('b', 'a'), folder('self', 'self'),
    ], new Set());

    const flat = flattenProjectFolderTree(tree);
    expect(flat.map((node) => node.folder.id).sort()).toEqual(['a', 'b', 'self']);
  });
});

describe('projectFolderIdsInSubtree', () => {
  test('collects a folder with all of its descendants', () => {
    const tree = buildProjectFolderTree([
      folder('a'), folder('b', 'a'), folder('c'), folder('d', 'b'),
    ], new Set());

    expect([...projectFolderIdsInSubtree(tree, 'a')].sort()).toEqual(['a', 'b', 'd']);
    expect([...projectFolderIdsInSubtree(tree, 'c')]).toEqual(['c']);
    expect([...projectFolderIdsInSubtree(tree, 'gone')]).toEqual([]);
  });
});
