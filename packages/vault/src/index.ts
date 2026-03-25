import type { Item, Vault } from "../../types/src/index.js";
import type {
  CapsuleCreateRequestDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
} from "../../types/src/index.js";

export interface VaultStore {
  listVaults(): Promise<Vault[]>;
  listItems(vaultId: string): Promise<Item[]>;
  getItem(vaultId: string, itemId: string): Promise<Item | null>;
  saveItem(vaultId: string, item: Item): Promise<void>;
  deleteItem(vaultId: string, itemId: string): Promise<void>;
}

export interface BuildCapsuleCreateInput {
  type: "item" | "field" | "file";
  plaintext: Uint8Array;
  encrypt: (plaintext: Uint8Array) => Promise<Uint8Array>;
  expiresAt?: string;
  maxViews?: number;
  password?: string;
  allowedRecipientEmails?: string[];
  filePlaintext?: Uint8Array;
}

export interface BuildCapsuleCreateResult {
  request: CapsuleCreateRequestDto;
}

export async function buildCapsuleCreateRequest(
  input: BuildCapsuleCreateInput,
): Promise<BuildCapsuleCreateResult> {
  const encryptedPayload = Buffer.from(await input.encrypt(input.plaintext)).toString("base64");
  let filePayload: string | undefined;
  if (input.filePlaintext) {
    filePayload = Buffer.from(await input.encrypt(input.filePlaintext)).toString("base64");
  }
  return {
    request: {
      type: input.type,
      encryptedPayload,
      ...(filePayload ? { filePayload } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.maxViews !== undefined ? { maxViews: input.maxViews } : {}),
      ...(input.password ? { password: input.password } : {}),
      ...(input.allowedRecipientEmails ? { allowedRecipientEmails: input.allowedRecipientEmails } : {}),
    },
  };
}

export interface OpenCapsuleInput {
  response: CapsuleOpenResponseDto;
  decrypt: (ciphertext: Uint8Array) => Promise<Uint8Array>;
}

export interface OpenCapsuleResult {
  metadata: CapsuleMetadataDto;
  plaintext: Uint8Array;
  filePlaintext?: Uint8Array;
}

export async function openCapsulePayload(input: OpenCapsuleInput): Promise<OpenCapsuleResult> {
  const payloadBytes = Uint8Array.from(Buffer.from(input.response.encryptedPayload, "base64"));
  const plaintext = await input.decrypt(payloadBytes);
  const metadata: CapsuleMetadataDto = {
    capsuleId: input.response.capsuleId,
    type: input.response.type,
    expiresAt: input.response.expiresAt,
    maxViews: input.response.maxViews,
    viewCount: input.response.viewCount,
    passwordRequired: input.response.passwordRequired,
    createdAt: input.response.createdAt,
  };
  let filePlaintext: Uint8Array | undefined;
  if (input.response.filePayload) {
    filePlaintext = await input.decrypt(
      Uint8Array.from(Buffer.from(input.response.filePayload, "base64")),
    );
  }
  return { metadata, plaintext, ...(filePlaintext ? { filePlaintext } : {}) };
}
