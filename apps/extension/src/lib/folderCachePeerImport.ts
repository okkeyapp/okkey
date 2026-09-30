/**
 * Pull plaintext personal-folder caches from the Okkey web origin IndexedDB into
 * the extension origin, so mixed-key streams can be resealed without a manual
 * "open web first" step.
 *
 * Web and extension do not share IndexedDB (different origins). The extension
 * briefly uses an existing web tab — or opens a background tab — then reads
 * `okkey-workspace-personal-sync` via chrome.scripting.
 */
import {
  importPeerWorkspaceFoldersCaches,
  readWorkspaceFoldersCachedState,
  type WorkspaceFoldersCachedStateDto,
} from "@okkey/vault";

import { readProfile } from "./storage";

const MIRROR_STORAGE_KEY = "okkey.extension.folderCacheMirror.v1";
const AGENT_REPAIR_PROBE_FOLDER_NAME = "extension-repair-probe";

type FolderCacheMirrorBag = {
  at: number;
  webBaseUrl: string;
  userId: string;
  rows: WorkspaceFoldersCachedStateDto[];
};

function countRealFoldersInState(folders: ReadonlyMap<string, { name: string }> | undefined): number {
  if (!folders) {
    return 0;
  }
  let count = 0;
  for (const folder of folders.values()) {
    if (folder.name !== AGENT_REPAIR_PROBE_FOLDER_NAME) {
      count += 1;
    }
  }
  return count;
}

/** Runs in the web page; must stay self-contained for executeScript. */
async function readWebPersonalFolderCachesInPage(): Promise<WorkspaceFoldersCachedStateDto[]> {
  const CACHE_DB = "okkey-workspace-personal-sync";
  const CACHE_STORE = "materialized_state";
  if (!globalThis.indexedDB) {
    return [];
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const next = req.result;
      if (!next.objectStoreNames.contains(CACHE_STORE)) {
        next.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
  });
  try {
    if (!db.objectStoreNames.contains(CACHE_STORE)) {
      return [];
    }
    const rows = await new Promise<WorkspaceFoldersCachedStateDto[]>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readonly");
      const store = tx.objectStore(CACHE_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const raw = (req.result ?? []) as WorkspaceFoldersCachedStateDto[];
        resolve(
          raw
            .filter((row) => row && typeof row.key === "string")
            .map((row) => ({
              key: row.key,
              lastAppliedVersion: Number(row.lastAppliedVersion) || 0,
              folders: Array.isArray(row.folders) ? row.folders : [],
              itemFolder: Array.isArray(row.itemFolder) ? row.itemFolder : [],
              itemFavorite: Array.isArray(row.itemFavorite) ? row.itemFavorite : [],
            })),
        );
      };
      req.onerror = () => reject(req.error);
    });
    return rows;
  } finally {
    db.close();
  }
}

function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("WEB_TAB_LOAD_TIMEOUT"));
    }, timeoutMs);

    function onUpdated(id: number, info: { status?: string }) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(onUpdated);
    void browser.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });
}

async function resolveWebOrigin(): Promise<string | null> {
  const profile = await readProfile();
  const raw = profile?.webBaseUrl?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function readRowsFromTab(tabId: number): Promise<WorkspaceFoldersCachedStateDto[]> {
  const injected = await browser.scripting.executeScript({
    target: { tabId },
    func: readWebPersonalFolderCachesInPage,
  });
  const first = injected[0]?.result;
  return Array.isArray(first) ? (first as WorkspaceFoldersCachedStateDto[]) : [];
}

async function readRowsFromWebOrigin(webOrigin: string): Promise<WorkspaceFoldersCachedStateDto[]> {
  const urlPatterns = [`${webOrigin}/*`, `${webOrigin}/`];
  const existing = await browser.tabs.query({ url: urlPatterns });
  const reusable = existing.find((tab) => typeof tab.id === "number");
  if (reusable?.id != null) {
    try {
      return await readRowsFromTab(reusable.id);
    } catch (err) {
      console.warn("[extension] folder peer read from existing tab failed", err);
    }
  }

  const tab = await browser.tabs.create({
    url: `${webOrigin}/`,
    active: false,
  });
  if (tab.id == null) {
    return [];
  }
  try {
    await waitForTabComplete(tab.id);
    await new Promise((r) => setTimeout(r, 250));
    return await readRowsFromTab(tab.id);
  } finally {
    await browser.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function readMirror(userId: string): Promise<WorkspaceFoldersCachedStateDto[]> {
  try {
    const bag = await browser.storage.local.get(MIRROR_STORAGE_KEY);
    const raw = bag[MIRROR_STORAGE_KEY] as FolderCacheMirrorBag | undefined;
    if (!raw || raw.userId !== userId || !Array.isArray(raw.rows)) {
      return [];
    }
    return raw.rows;
  } catch {
    return [];
  }
}

async function writeMirror(input: {
  userId: string;
  webBaseUrl: string;
  rows: WorkspaceFoldersCachedStateDto[];
}): Promise<void> {
  const body: FolderCacheMirrorBag = {
    at: Date.now(),
    userId: input.userId,
    webBaseUrl: input.webBaseUrl,
    rows: input.rows,
  };
  try {
    await browser.storage.local.set({ [MIRROR_STORAGE_KEY]: body });
  } catch {
    // best-effort
  }
}

/**
 * Import web plaintext folder caches into the extension IndexedDB (and refresh
 * the durable mirror). Call on unlock / workspace switch when local caches may
 * be empty while web still holds plaintext for mixed-key streams.
 */
export async function seedExtensionFolderCachesFromWebPeer(input: {
  userId: string;
  /** When set, skip peer pull if this workspace already has real folders locally. */
  workspaceId?: string;
}): Promise<{ importedWorkspaceIds: string[]; rowCount: number; source: "tab" | "mirror" | "none" }> {
  if (input.workspaceId) {
    const local = await readWorkspaceFoldersCachedState(input.userId, input.workspaceId);
    if (countRealFoldersInState(local?.folders) > 0) {
      return { importedWorkspaceIds: [], rowCount: 0, source: "none" };
    }
  }

  const webOrigin = await resolveWebOrigin();
  let rows: WorkspaceFoldersCachedStateDto[] = [];
  let source: "tab" | "mirror" | "none" = "none";

  rows = await readMirror(input.userId);
  if (rows.length > 0) {
    source = "mirror";
  } else if (webOrigin) {
    try {
      rows = await readRowsFromWebOrigin(webOrigin);
      if (rows.length > 0) {
        source = "tab";
        await writeMirror({ userId: input.userId, webBaseUrl: webOrigin, rows });
      }
    } catch (err) {
      console.warn("[extension] folder peer pull failed", err);
    }
  }

  if (input.workspaceId && webOrigin && source === "mirror") {
    const prefix = `okkey.workspace-personal-sync.v1.u.${input.userId}.w.${input.workspaceId}`;
    const mirrored = rows.find((row) => row.key === prefix);
    const mirroredReal = (mirrored?.folders ?? []).filter(
      ([, folder]) => folder?.name !== AGENT_REPAIR_PROBE_FOLDER_NAME,
    ).length;
    if (mirroredReal <= 0) {
      try {
        const live = await readRowsFromWebOrigin(webOrigin);
        if (live.length > 0) {
          rows = live;
          source = "tab";
          await writeMirror({ userId: input.userId, webBaseUrl: webOrigin, rows: live });
        }
      } catch (err) {
        console.warn("[extension] folder peer live refresh failed", err);
      }
    }
  }

  if (rows.length === 0) {
    return { importedWorkspaceIds: [], rowCount: 0, source };
  }

  const { importedWorkspaceIds } = await importPeerWorkspaceFoldersCaches({
    userId: input.userId,
    rows,
  });
  return { importedWorkspaceIds, rowCount: rows.length, source };
}
