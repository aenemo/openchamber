import React, { act } from 'react';
import { Window } from 'happy-dom';
import { expect, test } from 'bun:test';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';

const renderSidebar = async () => {
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
  useSessionDisplayStore.setState({ projectSortOrder: 'manual' });
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
