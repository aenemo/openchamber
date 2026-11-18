import React from 'react';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';

export const useHeldProjectOrder = (holdsOrder: boolean, order: ProjectSortOrder) => {
  const [heldProjectOrder, setHeldProjectOrder] = React.useState<readonly string[] | null>(null);
  const heldOrderRef = React.useRef(order);
  React.useEffect(() => {
    if (!holdsOrder || (heldProjectOrder && heldOrderRef.current !== order)) {
      heldOrderRef.current = order;
      setHeldProjectOrder(null);
    }
  }, [heldProjectOrder, holdsOrder, order]);
  const recordHold = React.useCallback((ids: readonly string[] | null) => {
    heldOrderRef.current = order;
    setHeldProjectOrder(ids);
  }, [order]);
  return { heldProjectOrder, recordHold };
};
