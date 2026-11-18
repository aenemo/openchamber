import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'bun:test';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import { installHookTestDom } from '../test-utils/testDom';
import { useHeldProjectOrder } from './useHeldProjectOrder';

const Harness = ({ holdsOrder, order }: { holdsOrder: boolean; order: ProjectSortOrder }) => {
  const { heldProjectOrder, recordHold } = useHeldProjectOrder(holdsOrder, order);
  harnessState.held = heldProjectOrder;
  harnessState.recordHold = recordHold;
  return null;
};

const harnessState: { held: readonly string[] | null; recordHold: (ids: readonly string[] | null) => void } = {
  held: null,
  recordHold: () => undefined,
};

test('holds the hovered order, releases on leave, and clears when the order switches', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(<Harness holdsOrder order="recent" />));
    expect(harnessState.held).toBeNull();
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    expect(harnessState.held).toEqual(['bravo', 'delta']);
    await act(async () => { harnessState.recordHold(null); });
    expect(harnessState.held).toBeNull();
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    expect(harnessState.held).toEqual(['bravo', 'delta']);
    await act(async () => root.render(<Harness holdsOrder order="least-recent" />));
    expect(harnessState.held).toBeNull();
    await act(async () => { harnessState.recordHold(['bravo', 'delta']); });
    await act(async () => root.render(<Harness holdsOrder={false} order="least-recent" />));
    expect(harnessState.held).toBeNull();
  } finally {
    await act(async () => root.unmount());
    dom.restore();
  }
});
