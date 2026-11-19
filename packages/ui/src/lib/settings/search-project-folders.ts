import type { SettingsSearchItem } from './search';

export const PROJECT_FOLDER_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: 'projects.folder',
    page: 'projects',
    titleKey: 'settings.projects.page.field.projectFolder',
    keywords: ['folder', 'organize', 'organise', 'group', 'sidebar', 'project metadata'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
];
