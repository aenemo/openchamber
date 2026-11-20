import React, { act } from 'react';
import { Window } from 'happy-dom';
import { expect, test } from 'bun:test';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import type { ProjectEntry } from '@/lib/api/types';

const PROJECTS: ProjectEntry[] = [
  { id: 'alpha', path: '/work/alpha', label: 'alpha' },
  { id: 'bravo', path: '/work/bravo', label: 'bravo' },
];

const renderSidebar = async (sortOrder: ProjectSortOrder = 'manual') => {
  const win = new Window({ url: 'http://localhost' });
  const values = { window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage, DOMRect: win.DOMRect, CustomEvent: win.CustomEvent, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), ResizeObserver: win.ResizeObserver, MutationObserver: win.MutationObserver, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, Event: win.Event, MouseEvent: win.MouseEvent, PointerEvent: win.PointerEvent, KeyboardEvent: win.KeyboardEvent, getComputedStyle: win.getComputedStyle.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  // These modules read the DOM when they load, so they come after the globals.
  const { createRoot } = await import('react-dom/client');
  const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
  const { I18nProvider } = await import('@/lib/i18n');
  const { ProjectsSidebar } = await import('./ProjectsSidebar');
  const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
  const { useProjectsStore } = await import('@/stores/useProjectsStore');
  useProjectsStore.setState({ projects: PROJECTS, manualProjectOrder: PROJECTS.map((project) => project.id), projectFolders: [] });
  useSessionDisplayStore.setState({ projectSortOrder: sortOrder });
  const persistCalls: ProjectSortOrder[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <ThemeSystemProvider>
      <I18nProvider>
        <ProjectsSidebar persistSortOrder={(order) => { persistCalls.push(order); }} />
      </I18nProvider>
    </ThemeSystemProvider>,
  ));
  const cleanup = async () => {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await win.happyDOM.close();
  };
  return { persistCalls, cleanup };
};

test('the settings projects header shows the current sort and lists all six orders', async () => {
  const sidebar = await renderSidebar();
  try {
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]');
    expect(trigger?.textContent).toContain('Manual');
    await act(async () => { trigger?.click(); });
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((item) => item.textContent)).toEqual(['Manual', 'A → Z', 'Z → A', 'Newest', 'Recent', 'Oldest']);
  } finally {
    await sidebar.cleanup();
  }
});

test('the settings project rows are draggable only while the order is manual', async () => {
  const manual = await renderSidebar('manual');
  try {
    expect(document.querySelectorAll('[data-settings-project]').length).toBe(2);
    expect(document.querySelectorAll('[data-settings-project] button[aria-roledescription="sortable"]').length).toBe(2);
  } finally {
    await manual.cleanup();
  }

  const sorted = await renderSidebar('a-z');
  try {
    expect(document.querySelectorAll('[data-settings-project]').length).toBe(2);
    expect(document.querySelectorAll('[data-settings-project] button[aria-roledescription="sortable"]').length).toBe(0);
  } finally {
    await sorted.cleanup();
  }
});
