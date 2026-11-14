import type { ExtensionAccountIdentity, ExtensionSession } from "./storage.ts";

/** Fields the account card renders. Empty name leaves only the email. */
export type AccountIdentityFields = ExtensionAccountIdentity;

type ProfileNameSource = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** Identity carried on the extension token exchange. Empty email means the card has nothing to show. */
export function accountIdentityFromSession(
  session: Pick<ExtensionSession, "email" | "firstName" | "lastName"> | null | undefined,
): AccountIdentityFields | null {
  const email = session?.email?.trim() ?? "";
  if (!email) {
    return null;
  }
  return {
    email,
    firstName: session?.firstName?.trim() ?? "",
    lastName: session?.lastName?.trim() ?? "",
  };
}

export function accountIdentityFromProfile(account: ProfileNameSource): AccountIdentityFields | null {
  const email = account.email?.trim() ?? "";
  if (!email) {
    return null;
  }
  return {
    email,
    firstName: account.first_name?.trim() ?? "",
    lastName: account.last_name?.trim() ?? "",
  };
}

/**
 * Primary line of the account card.
 * A missing name falls back to the email so the card never shows a placeholder dash.
 */
export function accountIdentityPrimaryText(identity: AccountIdentityFields | null | undefined): string {
  if (!identity) {
    return "";
  }
  const name = [identity.firstName, identity.lastName]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
  return name || identity.email.trim();
}

export function accountIdentityForBar(
  identity: AccountIdentityFields | null | undefined,
): AccountIdentityFields {
  return {
    email: identity?.email?.trim() ?? "",
    firstName: identity?.firstName?.trim() ?? "",
    lastName: identity?.lastName?.trim() ?? "",
  };
}
