import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findWorkspaceFolderPathById, toSidebarFolderTree } from "./workspaceFolderTree.ts";

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

    assert.equal(sidebar[0]?.defaultOpen, true);
    assert.equal(sidebar[0]?.children?.[0]?.defaultOpen, true);
    assert.equal(sidebar[0]?.children?.[0]?.children?.[0]?.isActive, true);
    assert.equal(sidebar[1]?.defaultOpen, undefined);
  });

  it("does not open unrelated branches", () => {
    const sidebar = toSidebarFolderTree(tree, (id) => `/items?folder=${id}`, "leaf");

    assert.equal(sidebar[1]?.defaultOpen, undefined);
  });

  it("findWorkspaceFolderPathById returns full ancestor path", () => {
    assert.equal(findWorkspaceFolderPathById(tree, "leaf"), "Parent / Child / Leaf");
    assert.equal(findWorkspaceFolderPathById(tree, "parent"), "Parent");
    assert.equal(findWorkspaceFolderPathById(tree, "missing"), "");
  });
});
