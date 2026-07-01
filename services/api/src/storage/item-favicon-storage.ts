import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { KeyFieldFileStorageConfig } from "./key-field-file-storage.ts";

export type ItemFaviconStorageConfig = KeyFieldFileStorageConfig;

function objectKeyPng(faviconId: string): string {
  return `favicons/${faviconId}.png`;
}

function objectKeyJpg(faviconId: string): string {
  return `favicons/${faviconId}.jpg`;
}

export class ItemFaviconStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ItemFaviconStorageConfig) {
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

  async put(faviconId: string, body: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKeyPng(faviconId),
        Body: body,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async get(faviconId: string): Promise<Uint8Array | null> {
    const png = await this.getObject(objectKeyPng(faviconId));
    if (png) {
      return png;
    }
    return this.getObject(objectKeyJpg(faviconId));
  }

  private async getObject(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      if (!response.Body) {
        return null;
      }
      return response.Body.transformToByteArray();
    } catch {
      return null;
    }
  }

  async delete(faviconId: string): Promise<void> {
    await Promise.all([
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: objectKeyPng(faviconId),
        }),
      ).catch(() => undefined),
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: objectKeyJpg(faviconId),
        }),
      ).catch(() => undefined),
    ]);
  }
}
