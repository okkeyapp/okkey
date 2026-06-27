import { describe, expect, it } from "vitest";

import { findWorkspaceFolderPathById, toSidebarFolderTree } from "./workspaceFolderTree";

describe("toSidebarFolderTree", () => {
  const tree = [
    {
      id: "parent",
      label: "Parent",
      children: [
        {
          id: "child",
          label: "Child",
          children: [{ id: "leaf", label: "Leaf" }],
        },
      ],
    },
    { id: "other", label: "Other" },
  ];

  it("opens ancestor branches when active folder is nested", () => {
    const sidebar = toSidebarFolderTree(tree, (id) => `/items?folder=${id}`, "leaf");

    expect(sidebar[0]?.defaultOpen).toBe(true);
    expect(sidebar[0]?.children?.[0]?.defaultOpen).toBe(true);
    expect(sidebar[0]?.children?.[0]?.children?.[0]?.isActive).toBe(true);
    expect(sidebar[1]?.defaultOpen).toBeUndefined();
  });

  it("does not open unrelated branches", () => {
    const sidebar = toSidebarFolderTree(tree, (id) => `/items?folder=${id}`, "leaf");

    expect(sidebar[1]?.defaultOpen).toBeUndefined();
  });

  it("findWorkspaceFolderPathById returns full ancestor path", () => {
    expect(findWorkspaceFolderPathById(tree, "leaf")).toBe("Parent / Child / Leaf");
    expect(findWorkspaceFolderPathById(tree, "parent")).toBe("Parent");
    expect(findWorkspaceFolderPathById(tree, "missing")).toBe("");
  });
});
