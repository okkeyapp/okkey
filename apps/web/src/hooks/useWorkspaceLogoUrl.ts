import { useEffect, useState } from "react";

import { useAuthenticatedCoreClient, useAuthVault } from "../auth/AuthVaultContext";
import { useWorkspaceLogoUrl as useLegacyWorkspaceLogoUrl } from "./legacyWorkspaceLogoUrl";

const encryptedLogoCache = new Map<string, string>();

/**
 * Legacy vault-attachment logos stay on the vault key.
 * A workspace-key logo (`logoKeyVersion`) is decrypted with the caller's workspace key wrap.
 */
export function useWorkspaceLogoUrl(input: {
  accessToken: string | null;
  vaultKey: Uint8Array | null;
  vaultId: string | null | undefined;
  attachmentId: string | null | undefined;
  workspaceId: string;
  enabled: boolean;
  logoKeyVersion?: number | null;
  userId?: string | null;
}): { imageSrc: string | undefined; loading: boolean } {
  const encrypted = input.logoKeyVersion != null && input.logoKeyVersion > 0;
  const legacy = useLegacyWorkspaceLogoUrl({
    accessToken: input.accessToken,
    vaultKey: input.vaultKey,
    vaultId: input.vaultId,
    attachmentId: input.attachmentId,
    workspaceId: input.workspaceId,
    enabled: input.enabled && !encrypted,
  });
  const core = useAuthenticatedCoreClient();
  const auth = useAuthVault();
  const cacheKey = encrypted ? `${input.workspaceId}:${input.logoKeyVersion}` : null;
  const [imageSrc, setImageSrc] = useState<string | undefined>(() =>
    cacheKey ? encryptedLogoCache.get(cacheKey) : undefined,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!encrypted || !cacheKey || !core || !input.vaultKey) {
      if (!encrypted) {
        setImageSrc(undefined);
        setLoading(false);
      }
      return;
    }
    const cached = encryptedLogoCache.get(cacheKey);
    if (cached) {
      setImageSrc(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void import("../workspace/workspaceKeyClient")
      .then(({ decryptWorkspaceLogo }) =>
        decryptWorkspaceLogo({
          core,
          workspaceId: input.workspaceId,
          vaultKey: input.vaultKey as Uint8Array,
          userId: input.userId ?? auth.userId,
        }),
      )
      .then((plaintext) => {
        const copy = new ArrayBuffer(plaintext.byteLength);
        new Uint8Array(copy).set(plaintext);
        const url = URL.createObjectURL(new Blob([copy]));
        encryptedLogoCache.set(cacheKey, url);
        if (!cancelled) {
          setImageSrc(url);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    auth.userId,
    cacheKey,
    core,
    encrypted,
    input.logoKeyVersion,
    input.userId,
    input.vaultKey,
    input.workspaceId,
  ]);

  if (encrypted) {
    return { imageSrc, loading };
  }
  return legacy;
}
