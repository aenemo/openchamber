import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useProjectsInSidebarOrder } from '@/components/session/sidebar/list/useProjectsInSidebarOrder';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECT_SORT_LABEL_KEYS, PROJECT_SORT_ORDERS, applyProjectSortOrder, defaultPersistProjectSortOrder, parseProjectSortOrder } from '@/components/session/sidebar/list/projectSort';
import { useSessionDisplayStore, type ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import { SettingsSidebarLayout } from '@/components/sections/shared/SettingsSidebarLayout';
import { SettingsSidebarItem } from '@/components/sections/shared/SettingsSidebarItem';
import { Icon } from "@/components/icon/Icon";
import { PROJECT_ICON_MAP, resolveProjectColor, ProjectIconImage } from '@/lib/projectMeta';
import { cn } from '@/lib/utils';
import { isVSCodeRuntime } from '@/lib/desktop';
import { sessionEvents } from '@/lib/sessionEvents';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';

type SortableProjectRowProps = {
  projectId: string;
  title: string;
  icon: React.ReactNode;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

const SortableProjectRow: React.FC<SortableProjectRowProps> = ({ projectId, title, icon, selected, disabled, onSelect }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: projectId,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-70')}
      data-settings-project={projectId}
    >
      <SettingsSidebarItem
        title={title}
        icon={icon}
        selected={selected}
        onSelect={onSelect}
        dragHandle={disabled ? undefined : { attributes, listeners, setActivatorRef: setActivatorNodeRef }}
      />
    </div>
  );
};

export const ProjectsSidebar: React.FC<{ onItemSelect?: () => void; persistSortOrder?: (order: ProjectSortOrder) => void }> = ({ onItemSelect, persistSortOrder = defaultPersistProjectSortOrder }) => {
  const { t } = useI18n();
  const projects = useProjectsInSidebarOrder(useProjectsStore((state) => state.projects));
  const selectedId = useUIStore((state) => state.settingsProjectsSelectedId);
  const setSelectedId = useUIStore((state) => state.setSettingsProjectsSelectedId);
  const { currentTheme } = useThemeSystem();

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  const projectSortOrder = useSessionDisplayStore((state) => state.projectSortOrder);
  const handleSortChange = React.useCallback((value: string) => {
    applyProjectSortOrder(value, persistSortOrder);
  }, [persistSortOrder]);

  const reorderProjects = useProjectsStore((state) => state.reorderProjects);
  const canReorder = !isVSCode && projectSortOrder === 'manual' && projects.length > 1;
  const projectIds = React.useMemo(() => projects.map((project) => project.id), [projects]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = React.useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = projectIds.indexOf(String(active.id));
    const to = projectIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderProjects(from, to);
  }, [projectIds, reorderProjects]);

  const handleAddProject = React.useCallback(() => {
    sessionEvents.requestDirectoryDialog();
  }, []);

  React.useEffect(() => {
    if (projects.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }
    if (selectedId && projects.some((p) => p.id === selectedId)) {
      return;
    }
    setSelectedId(projects[0].id);
  }, [projects, selectedId, setSelectedId]);

  return (
    <SettingsSidebarLayout
      variant="background"
      header={
        <div className={cn('border-b px-3', 'pt-4 pb-3')}>
          <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.page.projects.title')}</h2>
          <div className="flex items-center justify-between gap-2">
            <span className="typography-meta text-muted-foreground">{t('settings.projects.sidebar.total', { count: projects.length })}</span>
            <div className="flex items-center gap-1">
              <Select value={projectSortOrder} onValueChange={handleSortChange}>
                <SelectTrigger className="max-w-[128px]" aria-label={t('sessions.sidebar.header.actions.sortProjects')}>
                  <SelectValue>
                    {(value: string | undefined) => {
                      const order = value ? parseProjectSortOrder(value) : null;
                      return order ? t(PROJECT_SORT_LABEL_KEYS[order]) : '';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_SORT_ORDERS.map((order) => (
                    <SelectItem key={order} value={order}>{t(PROJECT_SORT_LABEL_KEYS[order])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isVSCode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -my-1 text-muted-foreground"
                  onClick={handleAddProject}
                  aria-label={t('settings.projects.sidebar.actions.addProject')}
                >
                  <Icon name="add" className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
          {projects.map((project) => {
            const selected = project.id === selectedId;
            const iconName = project.icon ? PROJECT_ICON_MAP[project.icon] : null;
            const color = resolveProjectColor(project.color);
            const fallbackIcon = iconName
              ? (
                <Icon name={iconName} className={cn('h-4 w-4', selected ? 'text-foreground' : 'text-muted-foreground')} style={color ? { color } : undefined} />
              )
              : (
                <Icon name="folder" className={cn('h-4 w-4', selected ? 'text-foreground' : 'text-muted-foreground')} style={color ? { color } : undefined} />
              );
            const icon = project.iconImage
              ? (
                <span
                  className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-[2px]"
                  style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
                >
                  <ProjectIconImage
                    project={project}
                    options={{
                      themeVariant: currentTheme.metadata.variant,
                      iconColor: currentTheme.colors.surface.foreground,
                    }}
                    className="h-full w-full object-contain"
                    fallback={fallbackIcon}
                  />
                </span>
              )
              : fallbackIcon;

            return (
              <SortableProjectRow
                key={project.id}
                projectId={project.id}
                title={project.label || project.path}
                icon={icon}
                selected={selected}
                disabled={!canReorder}
                onSelect={() => {
                  setSelectedId(project.id);
                  onItemSelect?.();
                }}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </SettingsSidebarLayout>
  );
};
