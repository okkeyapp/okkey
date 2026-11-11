import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_MONITORING_CARDS,
  WORKSPACE_KEY_PENDING_BANNER,
  workspaceAppearanceForMember,
} from "./workspaceAppearanceForMember";

const workspace = {
  tileColor: "#112233",
  logoKeyVersion: 3,
  logoVaultId: "vault",
  logoAttachmentId: "file",
};

describe("workspaceAppearanceForMember", () => {
  it("uses the default tile and does not expose ciphertext before the key is shared", () => {
    const appearance = workspaceAppearanceForMember({ access: "pending", workspace });
    expect(appearance.tileColor).toBeNull();
    expect(appearance.logoKeyVersion).toBeNull();
    expect(appearance.logoVaultId).toBeNull();
    expect(appearance.logoAttachmentId).toBeNull();
    expect(appearance.monitoringCards).toEqual(DEFAULT_WORKSPACE_MONITORING_CARDS);
    expect(appearance.banner).toBe(WORKSPACE_KEY_PENDING_BANNER);
    expect(appearance.banner).toBe("Workspace key has not been shared yet");
  });

  it("keeps the stored tile and logo once the member holds the key", () => {
    const appearance = workspaceAppearanceForMember({ access: "open", workspace });
    expect(appearance.tileColor).toBe("#112233");
    expect(appearance.logoKeyVersion).toBe(3);
    expect(appearance.logoVaultId).toBe("vault");
    expect(appearance.banner).toBeNull();
    expect(appearance.monitoringCards).toEqual(DEFAULT_WORKSPACE_MONITORING_CARDS);
  });
});
