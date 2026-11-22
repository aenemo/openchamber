import { describe, expect, test } from "bun:test";
import { COLOR_PRESETS, pickDeterministicLeastUsedColor, pickLeastUsedColor } from "@/lib/colorPresets";
import { parseProjectFolders } from "@/lib/settings/parsers";
import { buildProjectFolderTree, backfillTopLevelFolderColors, type ProjectFolder } from "./tree";
import type { DesktopSettings } from "@/lib/desktop";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { buildSessionSidebarRowModel } from "@/components/session/sidebar/sessionSidebarRowModel";
import type { ProjectSection } from "@/components/session/sidebar/projects/sessionProjectRender";
import type { SessionGroup, SessionNode } from "@/components/session/sidebar/types";

const node = (id: string): SessionNode => ({
  // SAFETY: test builds a minimal SessionNode; fields outside the sidebar model are intentionally omitted.
  session: { id, title: id, directory: "/repo", time: { created: 1, updated: 1 } } as never,
  children: [],
  worktree: null,
});

const mainGroup = (directory: string): SessionGroup => ({
  id: "main",
  label: "main",
  branch: null,
  description: null,
  isMain: true,
  worktree: null,
  directory,
  folderScopeKey: directory,
  sessions: [node(`s-${directory}`)],
});

const section = (id: string, path: string): ProjectSection => ({
  project: { id, normalizedPath: path },
  groups: [mainGroup(path)],
});

describe("top-level project folder color", () => {
  test("pickLeastUsedColor returns the single least-used preset", () => {
    const used = COLOR_PRESETS.slice(1);
    expect(pickLeastUsedColor(used)).toBe(COLOR_PRESETS[0]);
  });

  test("parseProjectFolders keeps a stored color and allows absent color", () => {
    const parsed = parseProjectFolders([
      { id: "top", name: "Top", parentId: null, color: "#e5484d", createdAt: 0, updatedAt: 0 },
      { id: "nested", name: "Nested", parentId: "top", createdAt: 0, updatedAt: 0 },
    ], {});
    expect(parsed?.find((f) => f.id === "top")?.color).toBe("#e5484d");
    expect(parsed?.find((f) => f.id === "nested")?.color ?? null).toBe(null);
  });

  test("creating a top-level folder assigns a palette color, nested folders stay colorless", () => {
    const previous = useProjectsStore.getState();
    try {
      useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [], projectFolders: [] });
      const store = () => useProjectsStore.getState();
      const top = store().addProjectFolder("Clients", null);
      expect(top?.parentId).toBe(null);
      expect(top?.color).toBeDefined();
      // SAFETY: COLOR_PRESETS holds known hex strings; spreading gives a mutable string array for includes.
      expect(([...COLOR_PRESETS] as string[]).includes(top?.color ?? "")).toBe(true);
      const nested = store().addProjectFolder("Sub", top?.id ?? null);
      expect(nested?.parentId).toBe(top?.id);
      expect(nested?.color ?? null).toBe(null);
    } finally {
      useProjectsStore.setState(previous, true);
    }
  });
});

describe("top-level folder color backfill", () => {
  test("fills colorless top-level folders, keeps stored colors, leaves nested folders gray", () => {
    const folders: ProjectFolder[] = [
      { id: "old", name: "Old", parentId: null, createdAt: 0, updatedAt: 0 },
      { id: "styled", name: "Styled", parentId: null, color: "#3e63dd", createdAt: 0, updatedAt: 0 },
      { id: "nested", name: "Nested", parentId: "old", createdAt: 0, updatedAt: 0 },
    ];
    const filled = backfillTopLevelFolderColors(folders, []);
    expect(filled).not.toBe(folders);
    // SAFETY: COLOR_PRESETS holds known hex strings; spreading gives a mutable string array for includes.
    expect(([...COLOR_PRESETS] as string[]).includes(filled[0]?.color ?? "")).toBe(true);
    expect(filled[1]?.color).toBe("#3e63dd");
    expect(filled[2]?.color ?? null).toBe(null);
    expect(folders[0]?.color ?? null).toBe(null);
  });

  test("returns the input untouched when nothing is missing and picks the single unused preset", () => {
    const folders: ProjectFolder[] = [
      { id: "top", name: "Top", parentId: null, color: "#e5484d", createdAt: 0, updatedAt: 0 },
    ];
    expect(backfillTopLevelFolderColors(folders, [])).toBe(folders);
    // SAFETY: COLOR_PRESETS entries are known hex strings; the mapped fixture preserves the string type.
    const used = COLOR_PRESETS.slice(1).map((color) => ({ color: color as string }));
    const filled = backfillTopLevelFolderColors(
      [{ id: "bare", name: "Bare", parentId: null, createdAt: 0, updatedAt: 0 }],
      used,
    );
    expect(filled[0]?.color).toBe(COLOR_PRESETS[0]);
  });

  test("consecutive backfills spread across the palette instead of repeating", () => {
    const filled = backfillTopLevelFolderColors([
      { id: "a", name: "A", parentId: null, createdAt: 0, updatedAt: 0 },
      { id: "b", name: "B", parentId: null, createdAt: 0, updatedAt: 0 },
    ], []);
    expect(filled[0]?.color).toBeDefined();
    expect(filled[1]?.color).toBeDefined();
    expect(filled[0]?.color).not.toBe(filled[1]?.color);
  });

  test("backfill is deterministic: the same folder id yields the same color on every pass", () => {
    const input = (): ProjectFolder[] => [
      { id: "legacy", name: "Legacy", parentId: null, createdAt: 0, updatedAt: 0 },
    ];
    const first = backfillTopLevelFolderColors(input(), [])[0]?.color;
    expect(first).toBeDefined();
    for (let i = 0; i < 10; i++) {
      expect(backfillTopLevelFolderColors(input(), [])[0]?.color).toBe(first);
    }
    expect(pickDeterministicLeastUsedColor("legacy", [])).toBe(first);
  });

  test("distinct folder ids spread across the palette instead of colliding", () => {
    const colors = ["a", "b", "c", "d", "e", "f", "g", "h"].map(
      (id) => backfillTopLevelFolderColors(
        [{ id, name: id, parentId: null, createdAt: 0, updatedAt: 0 }],
        [],
      )[0]?.color,
    );
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  test("sync preserves settled colors when the incoming document lacks them", () => {
    const previous = useProjectsStore.getState();
    try {
      useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [], projectFolders: [] });
      // SAFETY: test supplies only projects and projectFolders; synchronizeFromSettings reads only those keys.
      const laggingDocument = (): DesktopSettings => ({
        projects: [{ path: "/repo" }],
        projectFolders: [
          { id: "legacy", name: "Legacy", parentId: null, createdAt: 0, updatedAt: 0 },
        ],
      } as DesktopSettings);
      useProjectsStore.getState().synchronizeFromSettings(laggingDocument());
      const settled = useProjectsStore.getState().projectFolders.find((entry) => entry.id === "legacy")?.color;
      expect(settled).toBeDefined();
      for (let i = 0; i < 5; i++) {
        useProjectsStore.getState().synchronizeFromSettings(laggingDocument());
        expect(useProjectsStore.getState().projectFolders.find((entry) => entry.id === "legacy")?.color).toBe(settled);
      }
    } finally {
      useProjectsStore.setState(previous, true);
    }
  });

  test("syncing settings backfills legacy top-level folders and keeps nested folders gray", () => {
    const previous = useProjectsStore.getState();
    try {
      useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [], projectFolders: [] });
      // SAFETY: test supplies only projects and projectFolders; synchronizeFromSettings reads only those keys.
      useProjectsStore.getState().synchronizeFromSettings({
        projects: [{ path: "/repo" }],
        projectFolders: [
          { id: "legacy", name: "Legacy", parentId: null, createdAt: 0, updatedAt: 0 },
          { id: "sub", name: "Sub", parentId: "legacy", createdAt: 0, updatedAt: 0 },
        ],
      } as DesktopSettings);
      const folders = useProjectsStore.getState().projectFolders;
      // SAFETY: COLOR_PRESETS holds known hex strings; spreading gives a mutable string array for includes.
      expect(([...COLOR_PRESETS] as string[]).includes(folders.find((entry) => entry.id === "legacy")?.color ?? "")).toBe(true);
      expect(folders.find((entry) => entry.id === "sub")?.color ?? null).toBe(null);
    } finally {
      useProjectsStore.setState(previous, true);
    }
  });
});

describe("foldered project indent", () => {
  test("member projects sit one step deeper than their parent folder, roots stay at zero", () => {
    const sections = [section("p1", "/one"), section("p2", "/two")];
    const args = {
      mode: "normal" as const,
      sections,
      authoritativeSections: sections,
      chatGroup: null,
      foldersMap: {},
      collapsedProjects: new Set<string>(),
      collapsedGroups: new Set<string>(),
      collapsedFolders: new Set<string>(),
      collapsedActivities: new Set<string>(),
      expandedParents: new Set<string>(),
      visibleCountByContainer: new Map<string, number>(),
      pinnedSessionIds: new Set<string>(),
      sessionOrderIndex: new Map<string, number>(),
      groupStatusByKey: new Map(),
      folderAuthorityByOwner: new Map(),
      sessionOwnerById: new Map(),
      activeProjectId: null,
      singleProjectMode: false,
      singleProjectId: null,
      showOnlyMainWorkspace: false,
      hideDirectoryControls: false,
      projectsCaption: true,
      projectsCaptionAtTop: true,
      blocks: [{ kind: "projects" as const }],
      projectFolders: [
        { id: "clients", name: "clients", parentId: null, createdAt: 0, updatedAt: 0 },
        { id: "infra", name: "infra", parentId: "clients", createdAt: 0, updatedAt: 0 },
      ],
      collapsedProjectFolders: new Set<string>(),
      projectFolderIdByProjectId: new Map([["p1", "infra"]]),
    };
    const rows = buildSessionSidebarRowModel(args).rows;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const clients = byKey.get("project-folder:clients:header");
    const infra = byKey.get("project-folder:infra:header");
    const member = byKey.get("project:p1:header");
    const root = byKey.get("project:p2:header");
    expect(clients?.kind === "project-folder-header" ? clients.depth : -1).toBe(0);
    expect(infra?.kind === "project-folder-header" ? infra.depth : -1).toBe(1);
    expect(member?.kind === "project-header" ? (member.depth ?? 0) : -1).toBe(2);
    expect(root?.kind === "project-header" ? (root.depth ?? 0) : -1).toBe(0);
    expect(buildProjectFolderTree(args.projectFolders, new Set())[0]?.depth).toBe(0);
  });
});
