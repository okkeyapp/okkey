import { describe, expect, it } from "vitest";

import type { FolderPlaintextV2 } from "@okkey/types";

import {
  diffWorkspaceFolderTrees,
  rowsToWorkspaceTree,
  workspaceTreeToRowMap,
} from "./folderTreeCommit";
import type { WorkspaceFolderNode } from "./workspaceFolderTree";

function folderRow(
  folderId: string,
  workspaceId: string,
  name: string,
  parentFolderId: string | null,
  sortOrder: number,
): FolderPlaintextV2 {
  return {
    schemaVersion: 2,
    folderId,
    workspaceId,
    name,
    parentFolderId,
    sortOrder,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
}

describe("folderTreeCommit", () => {
  const workspaceId = "1156820912149101";
  const tree: WorkspaceFolderNode[] = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];

  it("preserves sibling order when materializing from rows", () => {
    const rows = new Map<string, FolderPlaintextV2>([
      ["a", folderRow("a", workspaceId, "Alpha", null, 2)],
      ["b", folderRow("b", workspaceId, "Beta", null, 0)],
      ["c", folderRow("c", workspaceId, "Gamma", null, 1)],
    ]);

    expect(rowsToWorkspaceTree(rows).map((node) => node.id)).toEqual(["b", "c", "a"]);
  });

  it("emits updates when only sibling order changes", () => {
    const previous = workspaceTreeToRowMap(tree);
    const previousRows = new Map(
      [...previous.entries()].map(([id, snapshot]) => [
        id,
        folderRow(id, workspaceId, snapshot.name, snapshot.parentFolderId, snapshot.sortOrder),
      ]),
    );

    const reordered: WorkspaceFolderNode[] = [
      { id: "c", label: "Gamma" },
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];

    const mutations = diffWorkspaceFolderTrees({
      workspaceId,
      previous: previousRows,
      nextTree: reordered,
      nowMs: 2,
    });

    expect(mutations).toHaveLength(3);
    expect(mutations.every((mutation) => mutation.kind === "update")).toBe(true);
    expect(
      mutations.map((mutation) => (mutation.kind === "update" ? mutation.folder.sortOrder : -1)),
    ).toEqual([0, 1, 2]);
  });
});
