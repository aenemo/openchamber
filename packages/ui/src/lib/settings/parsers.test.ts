import { describe, expect, test } from 'bun:test';
import { parseCustomProviderLogos, parseProjectFolders, parseProjects } from './parsers';

describe('parseCustomProviderLogos', () => {
  test('keeps well-formed entries and drops the rest one by one', () => {
    const raw = {
      acme: { mime: 'image/png', updatedAt: 1794114747809 },
      ' campus-llm ': { mime: 'image/svg+xml', updatedAt: 2 },
      gif: { mime: 'image/gif', updatedAt: 3 },
      stale: { mime: 'image/webp', updatedAt: 0 },
      '  ': { mime: 'image/png', updatedAt: 4 },
      broken: 'image/png',
    };

    expect(parseCustomProviderLogos(raw, {})).toEqual({
      acme: { mime: 'image/png', updatedAt: 1794114747809 },
      'campus-llm': { mime: 'image/svg+xml', updatedAt: 2 },
    });
    expect(parseCustomProviderLogos(['acme'], {})).toBeUndefined();
    expect(parseCustomProviderLogos(null, {})).toBeUndefined();
  });
});

describe('parseProjects', () => {
  test('keeps per-project agent, model and thinking defaults across a settings round trip', () => {
    const projects = [
      { path: '/repo/app', label: 'App', defaultAgent: ' reviewer ', defaultModel: 'openai/gpt-5.6', defaultVariant: 'low' },
      { path: '/repo/lib', defaultAgent: ' ', defaultModel: '  ', defaultVariant: 42 },
      { path: '/repo/legacy' },
    ];
    const parsed = parseProjects(projects, { projects });

    expect(parsed?.map((project) => [project.path, project.defaultAgent, project.defaultModel, project.defaultVariant])).toEqual([
      ['/repo/app', 'reviewer', 'openai/gpt-5.6', 'low'],
      ['/repo/lib', undefined, undefined, undefined],
      ['/repo/legacy', undefined, undefined, undefined],
    ]);
    expect(parseProjects(parsed, { projects: parsed })).toEqual(parsed);
  });

  test('keeps the folder link on each project', () => {
    const parsed = parseProjects([
      { path: '/repo/app', folderId: 'clients' },
      { path: '/repo/lib', folderId: '' },
      { path: '/repo/legacy' },
    ], { projects: [] });

    expect(parsed?.map((project) => project.folderId ?? null)).toEqual(['clients', null, null]);
  });
});

describe('parseProjectFolders', () => {
  test('keeps well-formed folders with their order and drops the rest one by one', () => {
    const parsed = parseProjectFolders([
      { id: 'clients', name: 'Clients', parentId: null, createdAt: 10, updatedAt: 12 },
      { id: 'infra', name: ' Infra ', parentId: 'clients' },
      { id: '', name: 'Nameless' },
      { id: 'empty', name: '   ' },
      { id: 'long', name: 'x'.repeat(81) },
      { id: 'clients', name: 'Duplicate' },
      'not-an-object',
    ], {});

    expect(parsed).toEqual([
      { id: 'clients', name: 'Clients', parentId: null, createdAt: 10, updatedAt: 12 },
      { id: 'infra', name: 'Infra', parentId: 'clients', createdAt: 0, updatedAt: 0 },
      { id: 'long', name: 'x'.repeat(80), parentId: null, createdAt: 0, updatedAt: 0 },
    ]);
  });

  test('lifts orphan folders to the root and breaks parent cycles', () => {
    const parsed = parseProjectFolders([
      { id: 'orphan', name: 'Orphan', parentId: 'gone' },
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
      { id: 'self', name: 'Self', parentId: 'self' },
    ], {});

    expect(parsed?.map((folder) => [folder.id, folder.parentId])).toEqual([
      ['orphan', null],
      ['a', null],
      ['b', 'a'],
      ['self', null],
    ]);
  });

  test('an empty folder list parses as empty', () => {
    expect(parseProjectFolders([], {})).toEqual([]);
  });
});
