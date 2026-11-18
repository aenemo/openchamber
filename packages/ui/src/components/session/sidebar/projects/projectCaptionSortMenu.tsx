import React from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useSessionDisplayStore, type ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import { PROJECT_SORT_CHOICES, PROJECT_SORT_LABEL_KEYS, PROJECT_SORT_ORDERS, applyProjectSortOrder, defaultPersistProjectSortOrder } from '../list/projectSort';

type ProjectCaptionSortMenuProps = {
  caption: string;
  mobileVariant: boolean;
  persistSortOrder?: (order: ProjectSortOrder) => void;
  children: React.ReactNode;
};

export const ProjectCaptionSortMenu: React.FC<ProjectCaptionSortMenuProps> = ({
  caption,
  mobileVariant,
  persistSortOrder = defaultPersistProjectSortOrder,
  children,
}) => {
  const { t } = useI18n();
  const projectSortOrder = useSessionDisplayStore((state) => state.projectSortOrder);
  if (caption !== 'projects' || mobileVariant) return children;
  const child = React.isValidElement<{ sortLabel?: string | null }>(children)
    ? React.cloneElement(children, { sortLabel: projectSortOrder === 'manual' ? null : t(PROJECT_SORT_LABEL_KEYS[projectSortOrder]) })
    : children;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div>{child}</div>} />
      <ContextMenuContent className="min-w-[200px]">
        {PROJECT_SORT_CHOICES.map(([order, labelKey]) => (
          <ContextMenuItem
            key={order}
            onClick={() => applyProjectSortOrder(order, persistSortOrder)}
            className="flex items-center justify-between"
          >
            <span>{t(labelKey)}</span>
            {projectSortOrder === order ? <Icon name="check" className="h-4 w-4 text-primary" /> : null}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};
