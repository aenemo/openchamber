import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'bun:test';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import { installHookTestDom } from '../test-utils/testDom';
import { useHeldProjectOrder } from '@/hooks/useHeldProjectOrder';

const Harness = ({ order }: { order: ProjectSortOrder }) => {
  const { heldProjectOrder, holdsProjectOrder, recordHold } = useHeldProjectOrder(order);
  harnessState.held = heldProjectOrder;
  harnessState.holds = holdsProjectOrder;
  harnessState.recordHold = recordHold;
  return null;
};

type HarnessState = {
  held: readonly string[] | null;
  holds: boolean;
  recordHold: (ids: readonly string[] | null) => void;
};

const harnessState: HarnessState = {
  held: null,
  holds: true,
  recordHold: () => undefined,
};

test('holds the hovered order, releases on leave, and clears when the order switches', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(<Harness order="recent" />));
    expect(harnessState.held).toBeNull();
    expect(harnessState.holds).toBe(true);
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    expect(harnessState.held).toEqual(['bravo', 'delta']);
    await act(async () => { harnessState.recordHold(null); });
    expect(harnessState.held).toBeNull();
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    expect(harnessState.held).toEqual(['bravo', 'delta']);
    await act(async () => root.render(<Harness order="least-recent" />));
    expect(harnessState.held).toBeNull();
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    await act(async () => root.render(<Harness order="manual" />));
    expect(harnessState.holds).toBe(false);
    expect(harnessState.held).toBeNull();
  } finally {
    await act(async () => root.unmount());
    dom.restore();
  }
});
