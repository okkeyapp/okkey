import {
  fetchRemoteFaviconBytesFromUrls,
  type FaviconProvider,
} from "./fetch-remote.ts";

export class ItemFaviconServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ItemFaviconServiceOptions = {
  /** Default `direct`. Use `google` only as an explicit privacy opt-in. */
  provider?: FaviconProvider;
};

export class ItemFaviconService {
  private readonly provider: FaviconProvider;

  constructor(options: ItemFaviconServiceOptions = {}) {
    this.provider = options.provider ?? "direct";
  }

  /** Fetch favicon bytes for form preview; does not write to object storage. */
  async previewFromUrls(urls: readonly string[]): Promise<Uint8Array | null> {
    return fetchRemoteFaviconBytesFromUrls(urls, { provider: this.provider });
  }
}
