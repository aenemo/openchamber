import { expect, test } from 'bun:test';
import { resolveProjectDropAction } from './projectDropAction';

const projectIds = ['root-a', 'in-alpha', 'in-beta', 'root-b'];
const folders = new Map<string, string | null>([
  ['root-a', null],
  ['in-alpha', 'alpha'],
  ['in-beta', 'beta'],
  ['root-b', null],
]);

test('a drop onto another folder in the foldered view moves the project instead of reordering', () => {
  expect(resolveProjectDropAction({
    activeId: 'in-alpha',
    overId: 'in-beta',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: true,
    sortOrder: 'manual',
  })).toEqual({ kind: 'move-to-folder', folderId: 'beta' });
  expect(resolveProjectDropAction({
    activeId: 'in-alpha',
    overId: 'root-a',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: true,
    sortOrder: 'manual',
  })).toEqual({ kind: 'move-to-folder', folderId: null });
});

test('a drop inside one folder reorders, and so does any drop without folder rows', () => {
  expect(resolveProjectDropAction({
    activeId: 'root-a',
    overId: 'root-b',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: true,
    sortOrder: 'manual',
  })).toEqual({ kind: 'reorder', from: 0, to: 3 });
  expect(resolveProjectDropAction({
    activeId: 'in-alpha',
    overId: 'in-beta',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: false,
    sortOrder: 'manual',
  })).toEqual({ kind: 'reorder', from: 1, to: 2 });
});

test('a ranked sort or an unknown row does nothing', () => {
  expect(resolveProjectDropAction({
    activeId: 'in-alpha',
    overId: 'in-beta',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: true,
    sortOrder: 'recent',
  })).toBeNull();
  expect(resolveProjectDropAction({
    activeId: 'missing',
    overId: 'in-beta',
    projectIds,
    folderIdByProjectId: folders,
    folderRowsPresent: true,
    sortOrder: 'manual',
  })).toBeNull();
});
