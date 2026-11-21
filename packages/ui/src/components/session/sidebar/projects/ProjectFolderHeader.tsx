import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { ProjectFolder } from '@/lib/projectFolders/tree';
import {
  buildProjectFolderTree,
  flattenProjectFolderTree,
  projectFolderIdsInSubtree,
} from '@/lib/projectFolders/tree';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';

type ProjectFolderHeaderProps = {
  folder: ProjectFolder;
  depth: number;
  collapsed: boolean;
  projectCount: number;
  mobileVariant: boolean;
  alwaysShowActions: boolean;
};

const FOLDER_INDENT_PX = 12;
const FOLDER_BASE_INSET_PX = 16;

const ProjectFolderDeleteDialog: React.FC<{ folder: ProjectFolder; onOpenChange: (open: boolean) => void }> = ({
  folder,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const folders = useProjectsStore((state) => state.projectFolders);
  const projects = useProjectsStore((state) => state.projects);

  const memberCount = React.useMemo(
    () => projects.filter((project) => project.folderId === folder.id).length,
    [projects, folder.id],
  );
  const childCount = React.useMemo(
    () => folders.filter((entry) => entry.parentId === folder.id).length,
    [folders, folder.id],
  );
  const subtreeIds = React.useMemo(
    () => projectFolderIdsInSubtree(buildProjectFolderTree(folders, new Set()), folder.id),
    [folders, folder.id],
  );
  const targets = React.useMemo(() => {
    const flat = flattenProjectFolderTree(buildProjectFolderTree(folders, new Set()));
    return flat.filter((node) => !subtreeIds.has(node.folder.id));
  }, [folders, subtreeIds]);
  const targetNameById = React.useMemo(() => new Map(targets.map((node) => [node.folder.id, node.folder.name])), [targets]);
  const [mode, setMode] = React.useState<'move' | 'close'>('move');
  const [targetId, setTargetId] = React.useState<string | null>(() => (
    folders.some((entry) => entry.id === folder.parentId && !subtreeIds.has(entry.id)) ? folder.parentId : null
  ));

  const confirm = React.useCallback(() => {
    const store = useProjectsStore.getState();
    const snapshot = {
      projects: store.projects,
      projectFolders: store.projectFolders,
      activeProjectId: store.activeProjectId,
      manualProjectOrder: store.manualProjectOrder,
    };
    const effectiveMode = memberCount === 0 ? 'move' : mode;
    store.deleteProjectFolder(folder.id, effectiveMode, mode === 'move' ? targetId : null);
    onOpenChange(false);
    const message = t('sessions.sidebar.projectFolders.deletedFolder', { name: folder.name });
    if (effectiveMode === 'move') {
      toast.success(message, {
        action: {
          label: t('sessions.sidebar.session.archive.undo'),
          onClick: () => store.restoreProjectTree(snapshot),
        },
      });
      return;
    }
    toast.success(message);
  }, [folder.id, folder.name, memberCount, mode, onOpenChange, t, targetId]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-5">
        <DialogHeader>
          <DialogTitle>{t('sessions.sidebar.dialogs.deleteFolder.title')}</DialogTitle>
          {memberCount === 0 && childCount === 0 ? (
            <DialogDescription>
              {t('sessions.sidebar.dialogs.deleteFolder.single', { folderName: folder.name })}
            </DialogDescription>
          ) : (
            <DialogDescription>
              {memberCount > 0
                ? t('sessions.sidebar.projectFolders.deleteMoveTo', { count: memberCount })
                : t('sessions.sidebar.projectFolders.deleteKeepsSubfolders', { count: childCount })}
            </DialogDescription>
          )}
          {memberCount > 0 && childCount > 0 ? (
            <DialogDescription>
              {t('sessions.sidebar.projectFolders.deleteKeepsSubfolders', { count: childCount })}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {memberCount === 0 ? null : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode('move')}
              aria-pressed={mode === 'move'}
              className="flex w-full items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name={mode === 'move' ? 'checkbox' : 'checkbox-blank'} className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 typography-ui-label text-foreground">
                {t('sessions.sidebar.projectFolders.deleteMoveTo', { count: memberCount })}
              </span>
            </button>
            {mode === 'move' ? (
              <Select value={targetId ?? ''} onValueChange={(value) => setTargetId(value === '' ? null : value)}>
                <SelectTrigger aria-label={t('sessions.sidebar.projectFolders.deleteMoveTo', { count: memberCount })}>
                  <SelectValue>
                    {(value: string | undefined) => (
                      value ? targetNameById.get(value) ?? value : t('sessions.sidebar.projectFolders.deleteMoveToRoot')
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('sessions.sidebar.projectFolders.deleteMoveToRoot')}</SelectItem>
                  {targets.map((node) => (
                    <SelectItem key={node.folder.id} value={node.folder.id}>
                      {'\u00a0\u00a0'.repeat(Math.min(node.depth, 8))}{node.folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <button
              type="button"
              onClick={() => setMode('close')}
              aria-pressed={mode === 'close'}
              className="flex w-full items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name={mode === 'close' ? 'checkbox' : 'checkbox-blank'} className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 typography-ui-label text-foreground">
                {t('sessions.sidebar.projectFolders.deleteCloseProjects', { count: memberCount })}
              </span>
            </button>
          </div>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 typography-ui-label text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('sessions.sidebar.dialogs.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex h-8 items-center justify-center rounded-md bg-destructive px-3 typography-ui-label text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
          >
            {t('sessions.sidebar.bulkActions.delete')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ProjectFolderHeader: React.FC<ProjectFolderHeaderProps> = ({
  folder,
  depth,
  collapsed,
  projectCount,
  mobileVariant,
  alwaysShowActions,
}) => {
  const { t } = useI18n();
  const toggleCollapsedProjectFolder = useSessionDisplayStore((state) => state.toggleCollapsedProjectFolder);
  const addProjectFolder = useProjectsStore((state) => state.addProjectFolder);
  const renameProjectFolder = useProjectsStore((state) => state.renameProjectFolder);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(folder.name);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const focusSelectRef = React.useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);
  const { setNodeRef, isOver } = useDroppable({
    id: `project-folder:${folder.id}`,
    data: { type: 'project-folder', folderId: folder.id, sortGroup: 'projects' },
  });

  const startRename = React.useCallback(() => {
    setDraft(folder.name);
    setRenaming(true);
  }, [folder.name]);

  const commitRename = React.useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) renameProjectFolder(folder.id, trimmed);
    setRenaming(false);
  }, [draft, folder.id, folder.name, renameProjectFolder]);

  const menuItems = (Item: React.ElementType, Separator: React.ElementType) => (
    <>
      <Item onClick={() => addProjectFolder(t('sessions.sidebar.folder.newFolderName'), folder.id)}>
        <Icon name="folder-add" className="me-1.5 h-4 w-4" />
        {t('sessions.sidebar.projectFolders.newSubfolder')}
      </Item>
      <Item onClick={startRename}>
        <Icon name="pencil-ai" className="me-1.5 h-4 w-4" />
        {t('sessions.sidebar.projectFolders.rename')}
      </Item>
      <Separator />
      <Item onClick={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
        <Icon name="delete-bin" className="me-1.5 h-4 w-4" />
        {t('sessions.sidebar.projectFolders.deleteFolder')}
      </Item>
    </>
  );

  return (
    <div ref={setNodeRef} className="relative -ms-2.5 -me-2" style={{ paddingInlineStart: depth * FOLDER_INDENT_PX }}>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                'group/folder flex w-full items-center gap-1 rounded-md py-1 pe-3.5',
                isOver && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
              )}
              style={{ paddingInlineStart: FOLDER_BASE_INSET_PX }}
            />
          }
        >
          {renaming ? (
            <input
              ref={focusSelectRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename();
                else if (event.key === 'Escape') setRenaming(false);
              }}
              aria-label={t('sessions.sidebar.projectFolders.rename')}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 typography-ui-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => toggleCollapsedProjectFolder(folder.id)}
              aria-expanded={!collapsed}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                mobileVariant && 'min-h-10',
              )}
            >
              <Icon
                name={collapsed ? 'arrow-right-s' : 'arrow-down-s'}
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground',
                  collapsed || alwaysShowActions ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100 group-focus-visible/folder:opacity-100',
                )}
              />
              <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate typography-ui-label font-medium text-foreground" dir="auto">{folder.name}</span>
              {projectCount > 0 ? <span data-project-folder-count className="shrink-0 typography-micro text-muted-foreground">{projectCount}</span> : null}
            </button>
          )}
          {renaming ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('sessions.sidebar.projectFolders.menu')}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  alwaysShowActions ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100 group-focus-visible/folder:opacity-100',
                )}
              >
                <Icon name="more" className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {menuItems(DropdownMenuItem, DropdownMenuSeparator)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[200px]">
          {menuItems(ContextMenuItem, ContextMenuSeparator)}
        </ContextMenuContent>
      </ContextMenu>
      {deleteOpen ? <ProjectFolderDeleteDialog folder={folder} onOpenChange={setDeleteOpen} /> : null}
    </div>
  );
};
