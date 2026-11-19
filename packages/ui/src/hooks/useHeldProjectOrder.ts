import React from 'react';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import { isActivityRankedOrder } from '@/components/session/sidebar/list/projectSort';

export const useHeldProjectOrder = (order: ProjectSortOrder) => {
  const holdsProjectOrder = isActivityRankedOrder(order);
  const [heldProjectOrder, setHeldProjectOrder] = React.useState<readonly string[] | null>(null);
  const heldOrderRef = React.useRef(order);
  React.useEffect(() => {
    if (heldOrderRef.current !== order) {
      heldOrderRef.current = order;
      setHeldProjectOrder(null);
    }
  }, [order]);
  const recordHold = React.useCallback((ids: readonly string[] | null) => {
    heldOrderRef.current = order;
    setHeldProjectOrder(ids);
  }, [order]);
  return { heldProjectOrder, holdsProjectOrder, recordHold };
};
