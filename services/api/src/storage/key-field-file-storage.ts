import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { generateEntityId } from "../entity-id.ts";

export interface KeyFieldFileStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export interface StoredKeyFieldFile {
  attachmentId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export function keyFieldAttachmentStorageKey(vaultId: string, attachmentId: string): string {
  return `attachments/${vaultId}/${attachmentId}`;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "file";
  }

  const baseName = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return baseName
    .replaceAll(/[\u0000-\u001F\u007F/\\?%*:|"<>]/g, "_")
    .replaceAll(/_+/g, "_")
    .slice(0, 255);
}

function encodeMetadataFileName(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url");
}

function decodeMetadataFileName(encoded: string | undefined, fallback: string): string {
  if (!encoded) {
    return fallback;
  }

  try {
    return Buffer.from(encoded, "base64url").toString("utf8") || fallback;
  } catch {
    return fallback;
  }
}

export class KeyFieldFileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: KeyFieldFileStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
    this.bucket = config.bucket;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(input: {
    vaultId: string;
    fileName: string;
    mimeType: string;
    body: Uint8Array;
    sizeBytes?: number;
  }): Promise<StoredKeyFieldFile> {
    const attachmentId = generateEntityId();
    const storageKey = keyFieldAttachmentStorageKey(input.vaultId, attachmentId);
    const safeName = sanitizeFileName(input.fileName);
    const contentType = input.mimeType.trim() || "application/octet-stream";

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.body,
        ContentType: contentType,
        Metadata: {
          "original-name-b64": encodeMetadataFileName(safeName),
          "original-mimetype": contentType,
        },
      }),
    );

    return {
      attachmentId,
      storageKey,
      name: safeName,
      mimeType: contentType,
      sizeBytes: input.sizeBytes ?? input.body.byteLength,
    };
  }

  async get(storageKey: string): Promise<{ body: Uint8Array; name: string; mimeType: string } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );

      if (!response.Body) {
        return null;
      }

      const bytes = await response.Body.transformToByteArray();
      const metadata = response.Metadata ?? {};
      const name = decodeMetadataFileName(
        metadata["original-name-b64"],
        metadata["original-name"] ?? "file",
      );
      const mimeType = response.ContentType ?? metadata["original-mimetype"] ?? "application/octet-stream";

      return {
        body: bytes,
        name,
        mimeType,
      };
    } catch {
      return null;
    }
  }

  async delete(attachmentId: string): Promise<void> {
    await this.deleteByStorageKey(attachmentId);
  }

  async deleteByStorageKey(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}

export function loadKeyFieldFileStorageConfigFromEnv(): KeyFieldFileStorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKey = process.env.S3_ACCESS_KEY?.trim();
  const secretKey = process.env.S3_SECRET_KEY?.trim();

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return null;
  }

  return {
    endpoint,
    region: process.env.S3_REGION?.trim() || "us-east-1",
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false",
  };
}
