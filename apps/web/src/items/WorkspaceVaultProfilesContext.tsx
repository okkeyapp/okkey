import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CoreClient } from "@okkey/api";
import {
  createFullAccessProfilePermissions,
  profileAllowsDatetime,
  profileAllowsEntriesArchive,
  profileAllowsEntriesDelete,
  profileAllowsEntriesGet,
  profileAllowsEntriesPost,
  profileAllowsEntriesPut,
  profileAllowsFieldType,
  profileAllowsFunction,
  profileAllowsItemView,
  type MeVaultProfileEntryDto,
  type ProfileFunctionActionId,
  type ProfilePermissions,
  type ProfilePermitsContext,
  type Vault,
} from "@okkey/types";

export type WorkspaceVaultProfilesContextValue = {
  ready: boolean;
  error: string | null;
  profilesByVaultId: ReadonlyMap<string, MeVaultProfileEntryDto>;
  refreshVaultProfiles: () => Promise<void>;
  getVaultPermissions: (vaultId: string) => ProfilePermissions | null;
  buildPermitsContext: (
    vaultId: string,
    itemCreatedByUserId?: string | null,
  ) => ProfilePermitsContext | null;
  canViewItem: (vaultId: string, categoryId: string, itemCreatedByUserId?: string | null) => boolean;
  canPostToVault: (vaultId: string) => boolean;
  canPutItem: (vaultId: string, itemCreatedByUserId?: string | null) => boolean;
  canArchiveItem: (vaultId: string, itemCreatedByUserId?: string | null) => boolean;
  canDeleteItem: (vaultId: string, itemCreatedByUserId?: string | null) => boolean;
  canUseFunction: (vaultId: string, action: ProfileFunctionActionId) => boolean;
  canViewFieldType: (vaultId: string, fieldType: string) => boolean;
  isDatetimeAllowed: (vaultId: string) => boolean;
};

const WorkspaceVaultProfilesContext = createContext<WorkspaceVaultProfilesContextValue | null>(null);

const FALLBACK_EXTENDED = createFullAccessProfilePermissions();

export function useWorkspaceVaultProfilesState(input: {
  workspaceId: string;
  core: CoreClient | null;
  vaultUnlocked: boolean;
  userId: string | null;
  vaults: readonly Vault[];
}): WorkspaceVaultProfilesContextValue {
  const { workspaceId, core, vaultUnlocked, userId, vaults } = input;
  const [profilesByVaultId, setProfilesByVaultId] = useState<Map<string, MeVaultProfileEntryDto>>(
    () => new Map(),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personalVaultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const vault of vaults) {
      if (vault.isPersonal) {
        ids.add(vault.id);
      }
    }
    return ids;
  }, [vaults]);

  const refreshVaultProfiles = useCallback(async () => {
    if (!core || !workspaceId || !vaultUnlocked) {
      setProfilesByVaultId(new Map());
      setReady(false);
      return;
    }
    try {
      const response = await core.getWorkspaceMeVaultProfiles(workspaceId);
      setProfilesByVaultId(new Map(response.vaults.map((entry) => [entry.vaultId, entry])));
      setError(null);
      setReady(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "vault profiles load failed");
      setReady(true);
    }
  }, [core, vaultUnlocked, workspaceId]);

  useEffect(() => {
    void refreshVaultProfiles();
  }, [refreshVaultProfiles]);

  const getVaultPermissions = useCallback(
    (vaultId: string): ProfilePermissions | null => {
      const entry = profilesByVaultId.get(vaultId);
      if (entry) {
        return entry.permissions;
      }
      if (personalVaultIds.has(vaultId)) {
        return FALLBACK_EXTENDED;
      }
      return null;
    },
    [personalVaultIds, profilesByVaultId],
  );

  const buildPermitsContext = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null): ProfilePermitsContext | null => {
      const permissions = getVaultPermissions(vaultId);
      if (!permissions) {
        return null;
      }
      return {
        permissions,
        userId,
        itemCreatedByUserId: itemCreatedByUserId ?? null,
      };
    },
    [getVaultPermissions, userId],
  );

  const canViewItem = useCallback(
    (vaultId: string, categoryId: string, itemCreatedByUserId?: string | null) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId, itemCreatedByUserId);
      if (!ctx) {
        return false;
      }
      return profileAllowsItemView(ctx, categoryId);
    },
    [buildPermitsContext, ready],
  );

  const canPostToVault = useCallback(
    (vaultId: string) => {
      if (!ready) {
        return personalVaultIds.has(vaultId);
      }
      const ctx = buildPermitsContext(vaultId);
      if (!ctx) {
        return false;
      }
      return profileAllowsEntriesPost(ctx);
    },
    [buildPermitsContext, personalVaultIds, ready],
  );

  const canPutItem = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId, itemCreatedByUserId);
      return ctx ? profileAllowsEntriesPut(ctx) : false;
    },
    [buildPermitsContext, ready],
  );

  const canArchiveItem = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId, itemCreatedByUserId);
      return ctx ? profileAllowsEntriesArchive(ctx) : false;
    },
    [buildPermitsContext, ready],
  );

  const canDeleteItem = useCallback(
    (vaultId: string, itemCreatedByUserId?: string | null) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId, itemCreatedByUserId);
      return ctx ? profileAllowsEntriesDelete(ctx) : false;
    },
    [buildPermitsContext, ready],
  );

  const canUseFunction = useCallback(
    (vaultId: string, action: ProfileFunctionActionId) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId);
      return ctx ? profileAllowsFunction(ctx, action) : false;
    },
    [buildPermitsContext, ready],
  );

  const canViewFieldType = useCallback(
    (vaultId: string, fieldType: string) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId);
      if (!ctx || !profileAllowsEntriesGet(ctx) || !profileAllowsDatetime(ctx)) {
        return false;
      }
      return profileAllowsFieldType(ctx, fieldType);
    },
    [buildPermitsContext, ready],
  );

  const isDatetimeAllowed = useCallback(
    (vaultId: string) => {
      if (!ready) {
        return true;
      }
      const ctx = buildPermitsContext(vaultId);
      return ctx ? profileAllowsDatetime(ctx) : false;
    },
    [buildPermitsContext, ready],
  );

  return useMemo(
    () => ({
      ready,
      error,
      profilesByVaultId,
      refreshVaultProfiles,
      getVaultPermissions,
      buildPermitsContext,
      canViewItem,
      canPostToVault,
      canPutItem,
      canArchiveItem,
      canDeleteItem,
      canUseFunction,
      canViewFieldType,
      isDatetimeAllowed,
    }),
    [
      ready,
      error,
      profilesByVaultId,
      refreshVaultProfiles,
      getVaultPermissions,
      buildPermitsContext,
      canViewItem,
      canPostToVault,
      canPutItem,
      canArchiveItem,
      canDeleteItem,
      canUseFunction,
      canViewFieldType,
      isDatetimeAllowed,
    ],
  );
}

export function WorkspaceVaultProfilesProvider({
  value,
  children,
}: {
  value: WorkspaceVaultProfilesContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceVaultProfilesContext.Provider value={value}>
      {children}
    </WorkspaceVaultProfilesContext.Provider>
  );
}

export function useWorkspaceVaultProfiles(): WorkspaceVaultProfilesContextValue {
  const value = useContext(WorkspaceVaultProfilesContext);
  if (!value) {
    return {
      ready: true,
      error: null,
      profilesByVaultId: new Map(),
      refreshVaultProfiles: async () => undefined,
      getVaultPermissions: () => FALLBACK_EXTENDED,
      buildPermitsContext: (_vaultId, itemCreatedByUserId) => ({
        permissions: FALLBACK_EXTENDED,
        itemCreatedByUserId: itemCreatedByUserId ?? null,
      }),
      canViewItem: () => true,
      canPostToVault: () => true,
      canPutItem: () => true,
      canArchiveItem: () => true,
      canDeleteItem: () => true,
      canUseFunction: () => true,
      canViewFieldType: () => true,
      isDatetimeAllowed: () => true,
    };
  }
  return value;
}
