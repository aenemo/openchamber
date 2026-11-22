import { describe, expect, test } from "bun:test"
import type { ProjectEntry } from "@/lib/api/types"
import type { DesktopSettings } from "@/lib/desktop"
import { parseSettingsDocument } from "@/lib/settings/registry"
import { useProjectsStore } from "./useProjectsStore"
import { createProjectIdFromPath } from "@/lib/projectId"
import { useDirectoryStore } from "./useDirectoryStore"
import { opencodeClient } from "../lib/opencode/client"

describe("useProjectsStore settings synchronization", () => {
  test("preserves drive roots and deduplicates Windows drive/separator variants", () => {
    const previous = useProjectsStore.getState()
    const directoryState = useDirectoryStore.getState()
    const sdkDirectory = opencodeClient.getDirectory()
    try {
      useProjectsStore.getState().synchronizeFromSettings({ projects: [
        { id: "drive", path: "c:\\" },
        { id: "lower", path: "c:\\Users\\Developer\\Project\\" },
        { id: "upper", path: "C:/Users/Developer/Project" },
      ] })
      expect(useProjectsStore.getState().projects.map((project) => project.path)).toEqual(["C:/", "C:/Users/Developer/Project"])
    } finally {
      useProjectsStore.setState(previous, true)
      useDirectoryStore.setState(directoryState, true)
      opencodeClient.setDirectory(sdkDirectory)
    }
  })

  test("directory navigation preserves roots and does not create history duplicates for Windows spelling variants", () => {
    const previous = useDirectoryStore.getState()
    const sdkDirectory = opencodeClient.getDirectory()
    try {
      useDirectoryStore.setState({ homeDirectory: "/home", currentDirectory: "/home", directoryHistory: ["/home"], historyIndex: 0 })
      useDirectoryStore.getState().setDirectory("c:\\Project")
      useDirectoryStore.getState().setDirectory("C:/Project/")
      expect(useDirectoryStore.getState().directoryHistory).toEqual(["/home", "C:/Project"])
      useDirectoryStore.setState({ directoryHistory: ["/home", "C:/Project", "C:/Other"], historyIndex: 1 })
      useDirectoryStore.getState().setDirectory("c:\\Project\\")
      expect(useDirectoryStore.getState().historyIndex).toBe(1)
      expect(useDirectoryStore.getState().directoryHistory).toEqual(["/home", "C:/Project", "C:/Other"])
      useDirectoryStore.getState().goToParent()
      expect(useDirectoryStore.getState().currentDirectory).toBe("C:/")
      expect(opencodeClient.getDirectory()).toBe("C:/")
      useDirectoryStore.getState().goToParent()
      expect(useDirectoryStore.getState().currentDirectory).toBe("C:/")
      useDirectoryStore.getState().setDirectory("\\\\Server\\Share\\Folder")
      useDirectoryStore.getState().goToParent()
      useDirectoryStore.getState().goToParent()
      expect(useDirectoryStore.getState().currentDirectory).toBe("//Server/Share")
    } finally {
      useDirectoryStore.setState(previous, true)
      opencodeClient.setDirectory(sdkDirectory)
    }
  })

  test("treats a successful empty project snapshot as authoritative", () => {
    const project = { id: "project-a", path: "/repo", label: "Repo" } as ProjectEntry
    useProjectsStore.setState({
      projects: [project],
      activeProjectId: project.id,
      manualProjectOrder: [project.id],
    })

    useProjectsStore.getState().synchronizeFromSettings({ projects: [] } as DesktopSettings)

    expect(useProjectsStore.getState().projects).toEqual([])
    expect(useProjectsStore.getState().activeProjectId).toBe(null)
    expect(useProjectsStore.getState().manualProjectOrder).toEqual([])
  })

  test("a reconcile sync never adopts another window's active project", () => {
    // Ids are path-derived inside the store's sanitizer, so seed real ones by
    // bootstrapping once and reading them back.
    const raw = { projects: [{ path: "/repo-a" }, { path: "/repo-b" }] } as DesktopSettings
    useProjectsStore.getState().synchronizeFromSettings(raw)
    const [first, second] = useProjectsStore.getState().projects
    useProjectsStore.setState({ activeProjectId: first.id })

    // The shared settings document carries window B's pointer; outside a
    // bootstrap this window keeps its own.
    useProjectsStore.getState().synchronizeFromSettings(
      { ...raw, activeProjectId: second.id } as DesktopSettings,
      { adoptActiveProject: false },
    )
    expect(useProjectsStore.getState().activeProjectId).toBe(first.id)

    // Unless its own project vanished from the list — then the incoming
    // pointer is better than a dangling one.
    useProjectsStore.getState().synchronizeFromSettings(
      { projects: [{ path: "/repo-b" }], activeProjectId: second.id } as DesktopSettings,
      { adoptActiveProject: false },
    )
    expect(useProjectsStore.getState().activeProjectId).toBe(second.id)

    // A bootstrap sync adopts as before.
    useProjectsStore.getState().synchronizeFromSettings(raw)
    useProjectsStore.setState({ activeProjectId: first.id })
    useProjectsStore.getState().synchronizeFromSettings(
      { ...raw, activeProjectId: second.id } as DesktopSettings,
    )
    expect(useProjectsStore.getState().activeProjectId).toBe(second.id)
  })
})

describe("useProjectsStore selection identity", () => {
  test("changes only the active project id", () => {
    const first = { id: "project-a", path: "/repo-a", lastOpenedAt: 10 } as ProjectEntry
    const second = { id: "project-b", path: "/repo-b", lastOpenedAt: 20 } as ProjectEntry
    const projects = [first, second]
    useProjectsStore.setState({
      projects,
      activeProjectId: first.id,
      manualProjectOrder: projects.map((project) => project.id),
    })

    useProjectsStore.getState().setActiveProjectIdOnly(second.id)

    const state = useProjectsStore.getState()
    expect(state.activeProjectId).toBe(second.id)
    expect(state.projects).toBe(projects)
    expect(state.projects.map((project) => project.lastOpenedAt)).toEqual([10, 20])
  })
})

describe("useProjectsStore default model and thinking level", () => {
  const seed = (project: ProjectEntry) => {
    useProjectsStore.setState({
      projects: [project],
      activeProjectId: project.id,
      manualProjectOrder: [project.id],
    })
  }

  test("keeps a thinking level next to the model it belongs to", () => {
    seed({ id: "project-a", path: "/repo" } as ProjectEntry)

    useProjectsStore.getState().updateProjectMeta("project-a", {
      defaultModel: "anthropic/claude-opus-5",
      defaultVariant: "high",
    })

    const project = useProjectsStore.getState().projects[0]
    expect(project?.defaultModel).toBe("anthropic/claude-opus-5")
    expect(project?.defaultVariant).toBe("high")
  })

  test("drops the thinking level when the model is cleared", () => {
    seed({
      id: "project-a",
      path: "/repo",
      defaultModel: "anthropic/claude-opus-5",
      defaultVariant: "high",
    } as ProjectEntry)

    useProjectsStore.getState().updateProjectMeta("project-a", { defaultModel: null })

    const project = useProjectsStore.getState().projects[0]
    expect(project?.defaultModel).toBe(undefined)
    expect(project?.defaultVariant).toBe(undefined)
  })

  test("ignores a thinking level that arrives without a model", () => {
    useProjectsStore.getState().synchronizeFromSettings({
      projects: [{ id: "project-a", path: "/repo", defaultVariant: "high" }],
    } as DesktopSettings)

    const project = useProjectsStore.getState().projects[0]
    expect(project?.defaultVariant).toBe(undefined)
  })

  test("persists and clears a project default agent", () => {
    seed({ id: "project-a", path: "/repo" })

    useProjectsStore.getState().updateProjectMeta("project-a", { defaultAgent: "plan" })
    expect(useProjectsStore.getState().projects[0]?.defaultAgent).toBe("plan")

    useProjectsStore.getState().updateProjectMeta("project-a", { defaultAgent: "   " })
    expect(useProjectsStore.getState().projects[0]?.defaultAgent).toBe(undefined)
  })

  test("sanitizes a project default agent from settings", () => {
    useProjectsStore.getState().synchronizeFromSettings({
      projects: [{ id: "project-a", path: "/repo", defaultAgent: "  plan  " }],
    })

    expect(useProjectsStore.getState().projects[0]?.defaultAgent).toBe("plan")
  })
})

describe("useProjectsStore.addProjects", () => {
  const resetProjects = () => {
    useProjectsStore.setState({
      projects: [],
      activeProjectId: null,
      manualProjectOrder: [],
    })
  }

  test("adds multiple new projects in one update and activates the first", async () => {
    resetProjects()

    const added = await useProjectsStore.getState().addProjects(["/one", "/two", "/three"])

    expect(added).toHaveLength(3)
    expect(useProjectsStore.getState().projects.map((p) => p.path)).toEqual(["/one", "/two", "/three"])
    expect(useProjectsStore.getState().activeProjectId).toBe(added[0].id)
    expect(added[0].addedAt).toBe(added[1].addedAt)
  })

  test("skips already-added paths and duplicates within the batch", async () => {
    resetProjects()
    await useProjectsStore.getState().addProjects(["/one"])

    const added = await useProjectsStore.getState().addProjects(["/one", "/two", "/two", "/one"])

    expect(added).toHaveLength(1)
    expect(added[0].path).toBe("/two")
    expect(useProjectsStore.getState().projects.map((p) => p.path)).toEqual(["/one", "/two"])
  })

  test("skips invalid paths and returns an empty array when nothing is addable", async () => {
    resetProjects()

    const added = await useProjectsStore.getState().addProjects(["", "   ", 42 as unknown as string])

    expect(added).toEqual([])
    expect(useProjectsStore.getState().projects).toEqual([])
  })

  test("normalizes paths (trailing separators, backslashes, tilde expansion)", async () => {
    resetProjects()

    const added = await useProjectsStore.getState().addProjects(["/repo/", "C:\\repo", "~/project"])

    const home = useDirectoryStore.getState().homeDirectory;
    expect(added.map((p) => p.path)).toEqual(["/repo", "C:/repo", home ? `${home}/project` : "~/project"])
  })
})

describe("useProjectsStore project labels", () => {
  const resetProjects = () => {
    useProjectsStore.setState({
      projects: [],
      activeProjectId: null,
      manualProjectOrder: [],
    })
  }

  for (const { path, label, method } of [
    { path: "/home/me/code/example", label: "Example", method: "renameProject" },
    { path: "/home/me/code/web-client", label: "Web Client", method: "updateProjectMeta" },
  ] as const) {
    test(`keeps ${label} after ${method} through parsed save and reload responses`, () => {
      const previous = useProjectsStore.getState()
      try {
        resetProjects()
        const initial = parseSettingsDocument({ projects: [{ path }] })
        if (!initial) throw new Error("Expected valid settings")
        useProjectsStore.getState().synchronizeFromSettings(initial)
        const project = useProjectsStore.getState().projects[0]
        expect(project).toBeDefined()

        if (method === "renameProject") useProjectsStore.getState().renameProject(project.id, label)
        else useProjectsStore.getState().updateProjectMeta(project.id, { label })

        const saved = JSON.stringify({ projects: useProjectsStore.getState().projects })
        for (const response of ["PUT", "GET"]) {
          if (response === "GET") resetProjects()
          const parsed = parseSettingsDocument(JSON.parse(saved))
          if (!parsed) throw new Error("Expected valid settings")
          useProjectsStore.getState().synchronizeFromSettings(parsed)
          expect(useProjectsStore.getState().projects[0]?.label).toBe(label)
          expect(useProjectsStore.getState().projects[0]?.labelSource).toBe("manual")
        }
      } finally {
        useProjectsStore.setState(previous, true)
      }
    })
  }

  test("lowers a legacy auto-derived label that carries no provenance", () => {
    const previous = useProjectsStore.getState()
    try {
      resetProjects()
      const parsed = parseSettingsDocument({
        projects: [{ path: "/home/me/code/example", label: "Example" }],
      })
      if (!parsed) throw new Error("Expected valid settings")
      useProjectsStore.getState().synchronizeFromSettings(parsed)

      expect(useProjectsStore.getState().projects[0]?.label).toBe("example")
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("marks a derived label as auto and a rename as manual", async () => {
    const previous = useProjectsStore.getState()
    try {
      resetProjects()
      const [added] = await useProjectsStore.getState().addProjects(["/home/me/code/example"])
      expect(added?.labelSource).toBe("auto")

      useProjectsStore.getState().renameProject(added.id, "Example")

      const project = useProjectsStore.getState().projects[0]
      expect(project?.label).toBe("Example")
      expect(project?.labelSource).toBe("manual")
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })
})

describe("useProjectsStore project folders", () => {
  const seed = (projects: ProjectEntry[] = [], folders: { id: string; name: string; parentId?: string | null; color?: string }[] = []) => {
    useProjectsStore.setState({
      projects,
      activeProjectId: projects[0]?.id ?? null,
      manualProjectOrder: projects.map((project) => project.id),
      projectFolders: folders.map((folder, index) => ({
        parentId: null,
        createdAt: index,
        updatedAt: index,
        ...folder,
      })),
    })
  }

  const resetAll = () => {
    useProjectsStore.setState({
      projects: [],
      activeProjectId: null,
      manualProjectOrder: [],
      projectFolders: [],
    })
  }

  test("creates folders with trimmed names and rejects blanks and unknown parents", () => {
    const previous = useProjectsStore.getState()
    try {
      resetAll()
      const store = () => useProjectsStore.getState()
      const root = store().addProjectFolder("  Clients  ")
      expect(root?.name).toBe("Clients")
      expect(root?.parentId).toBe(null)
      expect(store().addProjectFolder("   ")).toBe(null)
      expect(store().addProjectFolder("Sub", "nope")).toBe(null)
      const child = store().addProjectFolder("Infra", root?.id)
      expect(child?.parentId).toBe(root?.id)
      expect(store().projectFolders.map((folder) => folder.id)).toEqual([root?.id, child?.id])
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("renames folders and rejects blanks and unknown ids", () => {
    const previous = useProjectsStore.getState()
    try {
      seed([], [{ id: "f1", name: "Old" }])
      const store = () => useProjectsStore.getState()
      expect(store().renameProjectFolder("f1", "  New  ")).toBe(true)
      expect(store().projectFolders[0]?.name).toBe("New")
      expect(store().renameProjectFolder("f1", "   ")).toBe(false)
      expect(store().renameProjectFolder("gone", "New")).toBe(false)
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("moves folders between parents and positions and refuses cycles", () => {
    const previous = useProjectsStore.getState()
    try {
      seed([], [
        { id: "a", name: "A" },
        { id: "b", name: "B", parentId: "a" },
        { id: "c", name: "C" },
      ])
      const store = () => useProjectsStore.getState()
      expect(store().moveProjectFolder("b", null, 0)).toBe(true)
      expect(store().projectFolders.map((folder) => folder.id)).toEqual(["b", "a", "c"])
      expect(store().projectFolders.find((folder) => folder.id === "b")?.parentId).toBe(null)
      expect(store().moveProjectFolder("a", "a")).toBe(false)
      expect(store().moveProjectFolder("a", "b")).toBe(true)
      expect(store().moveProjectFolder("b", "a")).toBe(false)
      expect(store().moveProjectFolder("gone", null)).toBe(false)
      expect(store().projectFolders.map((folder) => [folder.id, folder.parentId])).toEqual([
        ["b", null],
        ["c", null],
        ["a", "b"],
      ])
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("moves projects between folders and back to the root", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [
          { id: "p1", path: "/one" },
          { id: "p2", path: "/two" },
        ],
        [{ id: "f1", name: "Clients" }],
      )
      const store = () => useProjectsStore.getState()
      expect(store().moveProjectToFolder("p1", "f1")).toBe(true)
      expect(store().projects.find((project) => project.id === "p1")?.folderId).toBe("f1")
      expect(store().moveProjectToFolder("p1", "f1")).toBe(true)
      expect(store().moveProjectToFolder("p1", null)).toBe(true)
      expect(store().projects.find((project) => project.id === "p1")?.folderId ?? null).toBe(null)
      expect(store().moveProjectToFolder("p1", "gone")).toBe(false)
      expect(store().moveProjectToFolder("gone", null)).toBe(false)
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("deleting a folder with move keeps child folders and moves only its direct projects", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [
          { id: "p1", path: "/one", folderId: "child" },
          { id: "p2", path: "/two", folderId: "parent" },
          { id: "p3", path: "/three" },
        ],
        [
          { id: "parent", name: "Parent" },
          { id: "child", name: "Child", parentId: "parent" },
          { id: "target", name: "Target" },
        ],
      )
      const outcome = useProjectsStore.getState().deleteProjectFolder("parent", "move", "target")
      expect(outcome).toEqual({ moved: 1, closed: 0 })
      const state = useProjectsStore.getState()
      expect(state.projectFolders.map((folder) => [folder.id, folder.parentId])).toEqual([
        ["child", "target"],
        ["target", null],
      ])
      expect(state.projects.find((project) => project.id === "p1")?.folderId).toBe("child")
      expect(state.projects.find((project) => project.id === "p2")?.folderId).toBe("target")
      expect(state.projects.find((project) => project.id === "p3")?.folderId ?? null).toBe(null)
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("deleting a folder with close removes only its direct projects", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [
          { id: "p1", path: "/one", folderId: "gone" },
          { id: "p2", path: "/two" },
        ],
        [{ id: "gone", name: "Gone" }],
      )
      const outcome = useProjectsStore.getState().deleteProjectFolder("gone", "close")
      expect(outcome).toEqual({ moved: 0, closed: 1 })
      const state = useProjectsStore.getState()
      expect(state.projectFolders).toEqual([])
      expect(state.projects.map((project) => project.id)).toEqual(["p2"])
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("deleting a folder with close keeps child folders and their projects", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [
          { id: "p1", path: "/one", folderId: "parent" },
          { id: "p2", path: "/two", folderId: "child" },
        ],
        [
          { id: "parent", name: "Parent" },
          { id: "child", name: "Child", parentId: "parent" },
        ],
      )
      const outcome = useProjectsStore.getState().deleteProjectFolder("parent", "close")
      expect(outcome).toEqual({ moved: 0, closed: 1 })
      const state = useProjectsStore.getState()
      expect(state.projectFolders.map((folder) => [folder.id, folder.parentId])).toEqual([
        ["child", null],
      ])
      expect(state.projects.map((project) => project.id)).toEqual(["p2"])
      expect(state.projects[0]?.folderId).toBe("child")
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("restores a folder delete snapshot for undo", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [{ id: "p1", path: "/one", folderId: "f1" }],
        [{ id: "f1", name: "Clients" }],
      )
      const snapshot = {
        projects: useProjectsStore.getState().projects,
        projectFolders: useProjectsStore.getState().projectFolders,
      }
      useProjectsStore.getState().deleteProjectFolder("f1", "move", null)
      expect(useProjectsStore.getState().projectFolders).toEqual([])
      useProjectsStore.getState().restoreProjectTree(snapshot)
      expect(useProjectsStore.getState().projectFolders.map((folder) => folder.id)).toEqual(["f1"])
      expect(useProjectsStore.getState().projects[0]?.folderId).toBe("f1")
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("restoring a close snapshot brings back the active project and manual order", () => {
    const previous = useProjectsStore.getState()
    try {
      seed(
        [
          { id: "p1", path: "/one", folderId: "f1" },
          { id: "p2", path: "/two" },
        ],
        [{ id: "f1", name: "Clients" }],
      )
      useProjectsStore.setState({ activeProjectId: "p1", manualProjectOrder: ["p2", "p1"] })
      const store = () => useProjectsStore.getState()
      const snapshot = {
        projects: store().projects,
        projectFolders: store().projectFolders,
        activeProjectId: store().activeProjectId,
        manualProjectOrder: store().manualProjectOrder,
      }
      expect(store().deleteProjectFolder("f1", "close")).toEqual({ moved: 0, closed: 1 })
      expect(store().projects.map((project) => project.id)).toEqual(["p2"])
      expect(store().activeProjectId).toBe("p2")
      expect(store().manualProjectOrder).toEqual(["p2"])
      store().restoreProjectTree(snapshot)
      expect(store().projects.map((project) => project.id).sort()).toEqual(["p1", "p2"])
      expect(store().projects.find((project) => project.id === "p1")?.folderId).toBe("f1")
      expect(store().activeProjectId).toBe("p1")
      expect(store().manualProjectOrder).toEqual(["p2", "p1"])
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("sync keeps local folders and links when the document has no folder key", () => {
    const previous = useProjectsStore.getState()
    try {
      resetAll()
      const [seeded] = [{ path: "/repo", folderId: "kept" }]
      seed(
        [{ id: createProjectIdFromPath("/repo"), ...seeded }],
        [{ id: "kept", name: "Kept", color: "#e5484d" }],
      )
      const folders = useProjectsStore.getState().projectFolders
      // SAFETY: the sync reads only projects here; the missing key is the case under test.
      useProjectsStore.getState().synchronizeFromSettings({
        projects: [{ path: "/repo" }],
      } as DesktopSettings)
      const state = useProjectsStore.getState()
      expect(state.projectFolders).toEqual(folders)
      expect(state.projects[0]?.folderId ?? null).toBe("kept")
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })

  test("sync drops project links to folders the settings no longer list", () => {
    const previous = useProjectsStore.getState()
    try {
      resetAll()
      // SAFETY: the sync reads projects and projectFolders here; the ghost link exercises orphan repair.
      useProjectsStore.getState().synchronizeFromSettings({
        projects: [{ path: "/repo", folderId: "ghost" }],
        projectFolders: [{ id: "kept", name: "Kept", parentId: null, createdAt: 0, updatedAt: 0 }],
      } as DesktopSettings)
      const state = useProjectsStore.getState()
      expect(state.projects[0]?.folderId ?? null).toBe(null)
      expect(state.projectFolders.map((folder) => folder.id)).toEqual(["kept"])
    } finally {
      useProjectsStore.setState(previous, true)
    }
  })
})
