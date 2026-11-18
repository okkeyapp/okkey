/**
 * Offline update package / combined archive size limits.
 *
 * Packages are signed JSON image manifests (typically a few KiB each), not
 * container layers. 1_000_000 bytes for the zip archive is intentional headroom
 * above real core+enterprise bundles without allowing multi-megabyte uploads.
 *
 * Body limits for JSON that carries the archive as base64, and for the apply
 * request envelope, are derived from the archive limit.
 */

/** Compressed `.okbundle` / `.zip` archive ceiling (bytes). */
export const OFFLINE_BUNDLE_MAX_ARCHIVE_BYTES = 1_000_000;

/**
 * Max JSON document size when the archive is embedded as `archiveBase64`
 * (or a single signed `.okpkg`). Base64 expands by 4/3, plus a small envelope.
 */
export const OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES =
  4 * Math.ceil(OFFLINE_BUNDLE_MAX_ARCHIVE_BYTES / 3) + 2048;

/**
 * Max HTTP body for `POST /system/updates/apply` when `source=file`.
 * Covers the document plus the small `{ source, document }` wrapper.
 */
export const OFFLINE_BUNDLE_MAX_APPLY_BODY_BYTES = OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES + 512;

/**
 * Nginx `client_max_body_size` for `/system/updates/` (mebibytes).
 * Must be ≥ {@link OFFLINE_BUNDLE_MAX_APPLY_BODY_BYTES} with a small margin;
 * must not be orders of magnitude larger than that path needs.
 */
export const OFFLINE_BUNDLE_NGINX_CLIENT_MAX_BODY_SIZE_MB = 2;

/** True when a selected offline upload file exceeds the shared UI/server ceiling. */
export function isOfflineUploadTooLarge(sizeBytes: number): boolean {
  return !Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES;
}
