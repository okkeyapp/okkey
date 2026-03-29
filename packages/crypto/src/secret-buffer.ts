export function wipeBytes(bytes: Uint8Array | null | undefined): void {
  if (!bytes) {
    return;
  }
  bytes.fill(0);
}

export async function withSensitiveBytesAsync<T>(
  bytes: Uint8Array,
  fn: (bytes: Uint8Array) => Promise<T>,
): Promise<T> {
  try {
    return await fn(bytes);
  } finally {
    wipeBytes(bytes);
  }
}

export function withSensitiveBytes<T>(
  bytes: Uint8Array,
  fn: (bytes: Uint8Array) => T,
): T {
  try {
    return fn(bytes);
  } finally {
    wipeBytes(bytes);
  }
}
