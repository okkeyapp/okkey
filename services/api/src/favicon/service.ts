import {
  faviconProviderFetchesOnServer,
  fetchRemoteFaviconBytesFromUrls,
  type FaviconProvider,
  type FaviconRemoteLookupResult,
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
  /** Default `off`. `direct` and `google` fetch on the server; `client` does not. */
  provider?: FaviconProvider;
};

export class ItemFaviconService {
  readonly provider: FaviconProvider;

  constructor(options: ItemFaviconServiceOptions = {}) {
    this.provider = options.provider ?? "off";
  }

  /** True when this process may contact a website or Google to resolve an icon. */
  serverFetchesWebsiteIcons(): boolean {
    return faviconProviderFetchesOnServer(this.provider);
  }

  /**
   * Fetch favicon bytes for form preview; does not write to object storage.
   * Distinguishes reachable absence from network unavailability.
   */
  async previewFromUrls(urls: readonly string[]): Promise<FaviconRemoteLookupResult> {
    return fetchRemoteFaviconBytesFromUrls(urls, { provider: this.provider });
  }
}
