import { downloadKeyFieldFileAttachment } from "@okkey/vault";
import { useEffect, useMemo, useState } from "react";

const logoUrlCache = new Map<string, string>();
const pendingLogoUrlCache = new Map<string, Promise<string>>();

function cacheKey(input: { vaultId: string; workspaceId: string; attachmentId: string }): string {
  return `${input.vaultId}:${input.workspaceId}:${input.attachmentId}`;
}

export function useWorkspaceLogoUrl(input: {
  apiBaseUrl: string;
  accessToken: string | null;
  vaultKey: Uint8Array | null;
  vaultId: string | null | undefined;
  attachmentId: string | null | undefined;
  workspaceId: string;
  enabled: boolean;
}): { imageSrc: string | undefined; loading: boolean } {
  const key = useMemo(() => {
    if (!input.vaultId || !input.attachmentId || !input.workspaceId) {
      return null;
    }
    return cacheKey({ vaultId: input.vaultId, workspaceId: input.workspaceId, attachmentId: input.attachmentId });
  }, [input.attachmentId, input.vaultId, input.workspaceId]);

  const [imageSrc, setImageSrc] = useState<string | undefined>(() => (key ? logoUrlCache.get(key) : undefined));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setImageSrc(key ? logoUrlCache.get(key) : undefined);
  }, [key]);

  useEffect(() => {
    if (
      !input.enabled ||
      !key ||
      !input.accessToken ||
      !input.vaultKey ||
      !input.vaultId ||
      !input.attachmentId ||
      logoUrlCache.has(key)
    ) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    let pending = pendingLogoUrlCache.get(key);
    if (!pending) {
      pending = downloadKeyFieldFileAttachment({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        vaultId: input.vaultId,
        itemId: input.workspaceId,
        vaultKey: input.vaultKey,
        file: {
          attachmentId: input.attachmentId,
          name: "workspace-logo",
          mimeType: "image/png",
          sizeBytes: 0,
        },
      }).then(
        (url) => {
          logoUrlCache.set(key, url);
          pendingLogoUrlCache.delete(key);
          return url;
        },
        (error: unknown) => {
          // Clear pending on failure so a later correct vault key can retry.
          pendingLogoUrlCache.delete(key);
          throw error;
        },
      );
      pendingLogoUrlCache.set(key, pending);
    }
    pending
      .then((url) => {
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
    input.apiBaseUrl,
    input.accessToken,
    input.attachmentId,
    input.enabled,
    input.vaultId,
    input.vaultKey,
    input.workspaceId,
    key,
  ]);

  return { imageSrc, loading };
}
