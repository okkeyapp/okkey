import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ObjectStorage {
  putObject(key: string, body: Uint8Array): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localRoot = path.resolve(__dirname, "../../.data/object-storage");

export class LocalObjectStorage implements ObjectStorage {
  async putObject(key: string, body: Uint8Array): Promise<void> {
    const fullPath = path.join(localRoot, sanitizeKey(key));
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, Buffer.from(body));
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    const fullPath = path.join(localRoot, sanitizeKey(key));
    try {
      const bytes = await readFile(fullPath);
      return Uint8Array.from(bytes);
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = path.join(localRoot, sanitizeKey(key));
    try {
      await unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function sanitizeKey(key: string): string {
  return key.replaceAll("..", "_").replaceAll("\\", "/");
}
