import { useEffect, useState } from "react";

import { useWorkspaceItems } from "./WorkspaceItemsContext";

/**
 * Resolves the per-vault encryption key (personal split-key or shared unwrap).
 * Returns null while sync is not ready or resolution is in flight / failed.
 */
export function useResolvedVaultEncryptionKey(vaultId: string | undefined): Uint8Array | null {
  const { resolveVaultEncryptionKey, bootstrapped } = useWorkspaceItems();
  const [resolvedKey, setResolvedKey] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!vaultId || !bootstrapped) {
      setResolvedKey(null);
      return;
    }

    let cancelled = false;
    setResolvedKey(null);
    void resolveVaultEncryptionKey(vaultId)
      .then((key) => {
        if (!cancelled) {
          setResolvedKey(key);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedKey(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [vaultId, bootstrapped, resolveVaultEncryptionKey]);

  return resolvedKey;
}
