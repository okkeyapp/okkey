import { fetchRemoteFaviconBytesFromUrls } from "./fetch-remote.ts";

export class ItemFaviconServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ItemFaviconService {
  /** Fetch favicon bytes for form preview; does not write to object storage. */
  async previewFromUrls(urls: readonly string[]): Promise<Uint8Array | null> {
    return fetchRemoteFaviconBytesFromUrls(urls);
  }
}
