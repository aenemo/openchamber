import React, { act } from 'react';
import { Window } from 'happy-dom';
import { expect, test } from 'bun:test';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';

const installTestDom = () => {
  const win = new Window({ url: 'http://localhost' });
  const values = { window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage, DOMRect: win.DOMRect, CustomEvent: win.CustomEvent, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), ResizeObserver: win.ResizeObserver, MutationObserver: win.MutationObserver, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, Event: win.Event, MouseEvent: win.MouseEvent, PointerEvent: win.PointerEvent, KeyboardEvent: win.KeyboardEvent, getComputedStyle: win.getComputedStyle.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const restore = async () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await win.happyDOM.close();
  };
  return { restore };
};

const renderCaptionMenu = async (options: { caption?: string; mobileVariant?: boolean; sortOrder?: ProjectSortOrder } = {}) => {
  const { restore } = installTestDom();
  // These modules read the DOM when they load, so they come after the globals.
  const { createRoot } = await import('react-dom/client');
  const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
  const { I18nProvider } = await import('@/lib/i18n');
  const { ProjectCaptionSortMenu } = await import('./projectCaptionSortMenu');
  const { SessionSidebarCaption } = await import('../sessionSidebarHeaderPresentation');
  const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
  useSessionDisplayStore.setState({ projectSortOrder: options.sortOrder ?? 'manual' });
  const persistCalls: ProjectSortOrder[] = [];
  let toggled = 0;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <ThemeSystemProvider>
      <I18nProvider>
        <ProjectCaptionSortMenu
          caption={options.caption ?? 'projects'}
          mobileVariant={options.mobileVariant ?? false}
          persistSortOrder={(order) => { persistCalls.push(order); }}
        >
          <SessionSidebarCaption
            label="Projects"
            collapsed={false}
            alwaysShowActions={false}
            addsProjects={(options.caption ?? 'projects') === 'projects'}
            onToggle={() => { toggled += 1; }}
          />
        </ProjectCaptionSortMenu>
      </I18nProvider>
    </ThemeSystemProvider>,
  ));
  const toggleButton = () => container.querySelector('button');
  const addButton = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const openMenu = async () => {
    await act(async () => {
      toggleButton()?.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
    });
  };
  const menuItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const openAddMenu = async () => {
    await act(async () => { addButton()?.click(); });
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    await restore();
  };
  return { openMenu, menuItems, toggleButton, addButton, openAddMenu, toggled: () => toggled, persistCalls, cleanup };
};

test('right-clicking the projects caption lists the six sort orders plus new folder and keeps left-click toggle', async () => {
  const menu = await renderCaptionMenu();
  try {
    await act(async () => { menu.toggleButton()?.click(); });
    expect(menu.toggled()).toBe(1);
    await menu.openMenu();
    expect(menu.menuItems().length).toBe(7);
  } finally {
    await menu.cleanup();
  }
});

test('picking a sort order from the caption menu stores it and persists the profile key', async () => {
  const menu = await renderCaptionMenu();
  try {
    await menu.openMenu();
    const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
    const items = menu.menuItems();
    await act(async () => { items[1]?.click(); });
    expect(useSessionDisplayStore.getState().projectSortOrder).toBe('a-z');
    expect(menu.persistCalls).toEqual(['a-z']);
  } finally {
    await menu.cleanup();
  }
});

test('the caption menu checks the active sort order', async () => {
  const menu = await renderCaptionMenu({ sortOrder: 'least-recent' });
  try {
    await menu.openMenu();
    const items = menu.menuItems();
    const oldest = items.filter((item) => item.textContent?.includes('Oldest'));
    expect(oldest.length).toBe(1);
    expect(oldest[0]?.querySelector('svg')).not.toBe(null);
  } finally {
    await menu.cleanup();
  }
});

test('the caption menu creates a root project folder from its new folder item', async () => {
  const menu = await renderCaptionMenu();
  try {
    const { useProjectsStore } = await import('@/stores/useProjectsStore');
    const previous = useProjectsStore.getState();
    try {
      useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [], projectFolders: [] });
      await menu.openMenu();
      const items = menu.menuItems();
      await act(async () => { items[items.length - 1]?.click(); });
      const folders = useProjectsStore.getState().projectFolders;
      expect(folders.length).toBe(1);
      expect(folders[0]?.name).toBe('New folder');
      expect(folders[0]?.parentId).toBe(null);
    } finally {
      useProjectsStore.setState(previous, true);
    }
  } finally {
    await menu.cleanup();
  }
});

test('the projects add button offers Add project and New folder', async () => {
  const menu = await renderCaptionMenu();
  try {
    expect(menu.addButton()?.getAttribute('aria-label')).toBe('Add project');
    await menu.openAddMenu();
    expect(menu.menuItems().map((item) => item.textContent?.trim())).toEqual(['Add project', 'New folder...']);
  } finally {
    await menu.cleanup();
  }
});

test('picking New folder from the projects add button creates a root project folder', async () => {
  const menu = await renderCaptionMenu();
  try {
    const { useProjectsStore } = await import('@/stores/useProjectsStore');
    const previous = useProjectsStore.getState();
    try {
      useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [], projectFolders: [] });
      await menu.openAddMenu();
      const item = menu.menuItems().find((entry) => entry.textContent?.trim() === 'New folder...');
      await act(async () => { item?.click(); });
      const folders = useProjectsStore.getState().projectFolders;
      expect(folders.length).toBe(1);
      expect(folders[0]?.name).toBe('New folder');
      expect(folders[0]?.parentId).toBe(null);
    } finally {
      useProjectsStore.setState(previous, true);
    }
  } finally {
    await menu.cleanup();
  }
});

test('picking Add project from the projects add button opens the directory dialog', async () => {
  const menu = await renderCaptionMenu();
  try {
    const { sessionEvents } = await import('@/lib/sessionEvents');
    let requests = 0;
    const unsubscribe = sessionEvents.onDirectoryRequest(() => { requests += 1; });
    try {
      await menu.openAddMenu();
      const item = menu.menuItems().find((entry) => entry.textContent?.trim() === 'Add project');
      await act(async () => { item?.click(); });
      expect(requests).toBe(1);
    } finally {
      unsubscribe();
    }
  } finally {
    await menu.cleanup();
  }
});

test('applyProjectSortOrder stores and persists known orders and ignores the rest', async () => {
  const { applyProjectSortOrder } = await import('../list/projectSort');
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

test('the projects caption shows no sort label for manual order', async () => {
  const menu = await renderCaptionMenu({ sortOrder: 'manual' });
  try {
    expect(menu.toggleButton()?.textContent).toBe('Projects');
  } finally {
    await menu.cleanup();
  }
});

test('the projects caption shows the active sort label', async () => {
  const menu = await renderCaptionMenu({ sortOrder: 'recent' });
  try {
    expect(menu.toggleButton()?.textContent).toContain('Recent');
  } finally {
    await menu.cleanup();
  }
});

test('right-clicking the section-wrapped projects caption opens the menu and shows the sort label', async () => {
  const { restore } = installTestDom();
  const { DndContext } = await import('@dnd-kit/core');
  const { SortableSidebarSection } = await import('./SortableSidebarSection');
  const { SessionSidebarCaption } = await import('../sessionSidebarHeaderPresentation');
  const { ProjectCaptionSortMenu } = await import('./projectCaptionSortMenu');
  const { createRoot } = await import('react-dom/client');
  const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
  const { I18nProvider } = await import('@/lib/i18n');
  const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
  useSessionDisplayStore.setState({ projectSortOrder: 'recent' });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <ThemeSystemProvider>
      <I18nProvider>
        <DndContext>
          <SortableSidebarSection sectionId="projects" rowKey="caption:projects" disabled>
            <ProjectCaptionSortMenu caption="projects" mobileVariant={false}>
              <SessionSidebarCaption label="Projects" collapsed={false} alwaysShowActions={false} addsProjects onToggle={() => undefined} />
            </ProjectCaptionSortMenu>
          </SortableSidebarSection>
        </DndContext>
      </I18nProvider>
    </ThemeSystemProvider>,
  ));
  try {
    expect(container.querySelector('button')?.textContent).toContain('Recent');
    const caption = container.querySelector('button');
    await act(async () => {
      caption?.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).length).toBe(7);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    await restore();
  }
});

test('other captions and the phone keep no caption sort menu', async () => {
  for (const options of [{ caption: 'chats' }, { mobileVariant: true }]) {
    const menu = await renderCaptionMenu(options);
    try {
      await menu.openMenu();
      expect(menu.menuItems().length).toBe(0);
    } finally {
      await menu.cleanup();
    }
  }
});
