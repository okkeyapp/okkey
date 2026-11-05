/**
 * Capsule guest-key delivery.
 *
 * The built-in strategy is the legacy URL fragment. Hybrid delivery is an
 * extension point only: anonymous guests have no identity key, and this
 * module does not choose an ephemeral recipient or a logged-in recipient.
 * `readCapsuleGuestKey` keeps decoding the legacy fragment.
 */
import { decodeCapsuleKeyFragment, encodeCapsuleKeyFragment } from "./capsule.js";

export const CAPSULE_GUEST_KEY_DELIVERY_LEGACY_FRAGMENT = "legacy_fragment" as const;

/** Neither ephemeral-link nor logged-in-user hybrid delivery is selected. */
export const CAPSULE_GUEST_KEY_HYBRID_RECIPIENT = "undecided" as const;

export type CapsuleGuestKeyDelivery = {
  readonly id: string;
  exportMaterial(capsuleKey: Uint8Array): string;
  importMaterial(material: string): Uint8Array;
};

export function legacyFragmentGuestKeyDelivery(): CapsuleGuestKeyDelivery {
  return {
    id: CAPSULE_GUEST_KEY_DELIVERY_LEGACY_FRAGMENT,
    exportMaterial: encodeCapsuleKeyFragment,
    importMaterial: decodeCapsuleKeyFragment,
  };
}

/** Active guest-key delivery. Hybrid strategies are not installed. */
export function activeCapsuleGuestKeyDelivery(): CapsuleGuestKeyDelivery {
  return legacyFragmentGuestKeyDelivery();
}

/** Decode a guest key. Legacy `#key=` fragments remain valid. */
export function readCapsuleGuestKey(material: string): Uint8Array {
  return activeCapsuleGuestKeyDelivery().importMaterial(material);
}
