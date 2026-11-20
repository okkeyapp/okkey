/**
 * Best-effort detection of OAuth / “Continue with …” social sign-in on a page.
 * Full IdP coverage is not required — common providers + wording cues only.
 * Not related to Enterprise SSO.
 */

/** Known consumer IdP hosts (hostname lowercase, no port). */
const OAUTH_IDP_HOST_SUFFIXES = [
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
  "login.live.com",
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "github.com",
  "login.yahoo.com",
  "api.twitter.com",
  "twitter.com",
  "x.com",
  "oauth.telegram.org",
] as const;

/**
 * Unicode-aware edges — JS `\b` is ASCII-only.
 * Matches EN/RU “Continue with / Sign in with / Войти через …” + provider name.
 */
const OAUTH_BUTTON_TEXT =
  /(?<![\p{L}\p{N}_])(?:(?:continue|sign\s*in|log\s*in|sign\s*up|войти|продолжить)\s+(?:with|via|через|с)\s+|войти\s+через\s+)(google|apple|facebook|microsoft|github|yahoo|twitter|x(?![\p{L}\p{N}_])|discord|linkedin|yandex|вконтакте|вк|mail\.ru|ok\.ru)(?![\p{L}\p{N}_])/iu;

const OAUTH_PROVIDER_ONLY =
  /(?<![\p{L}\p{N}_])(?:google|apple|facebook|microsoft|github)\s+(?:account|аккаунт)(?![\p{L}\p{N}_])/iu;

const OAUTH_HREF =
  /accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|facebook\.com\/.*(login|oauth)|github\.com\/login\/oauth/i;

export type OauthProviderHint =
  | "Google"
  | "Apple"
  | "Facebook"
  | "Microsoft"
  | "GitHub"
  | "Yahoo"
  | "Twitter"
  | "Discord"
  | "LinkedIn"
  | "Yandex"
  | "VK"
  | "Mail.ru"
  | "OK.ru"
  | "Other";

export type OauthSignInDetection = {
  detected: boolean;
  providerHint?: OauthProviderHint;
};

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

/** True when the page is a known OAuth IdP (skip save-offer restore there). */
export function isOauthIdpHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) {
    return false;
  }
  return OAUTH_IDP_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function providerFromMatch(raw: string): OauthProviderHint {
  const key = raw.trim().toLowerCase();
  if (key === "google") return "Google";
  if (key === "apple") return "Apple";
  if (key === "facebook") return "Facebook";
  if (key === "microsoft") return "Microsoft";
  if (key === "github") return "GitHub";
  if (key === "yahoo") return "Yahoo";
  if (key === "twitter" || key === "x") return "Twitter";
  if (key === "discord") return "Discord";
  if (key === "linkedin") return "LinkedIn";
  if (key === "yandex") return "Yandex";
  if (key === "вконтакте" || key === "вк" || key === "vk") return "VK";
  if (key === "mail.ru") return "Mail.ru";
  if (key === "ok.ru") return "OK.ru";
  return "Other";
}

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function ariaOrTitle(el: Element): string {
  const aria = el.getAttribute("aria-label") ?? "";
  const title = el.getAttribute("title") ?? "";
  return `${aria} ${title}`.replace(/\s+/g, " ").trim();
}

function hrefOf(el: Element): string {
  const maybeHref = (el as { href?: unknown }).href;
  if (typeof maybeHref === "string" && maybeHref) {
    return maybeHref;
  }
  return el.getAttribute("href") ?? "";
}

function detectFromText(blob: string): OauthSignInDetection | null {
  const match = OAUTH_BUTTON_TEXT.exec(blob);
  if (match?.[1]) {
    return { detected: true, providerHint: providerFromMatch(match[1]) };
  }
  if (OAUTH_PROVIDER_ONLY.test(blob)) {
    const m = /(google|apple|facebook|microsoft|github)/i.exec(blob);
    return {
      detected: true,
      providerHint: m?.[1] ? providerFromMatch(m[1]) : "Other",
    };
  }
  return null;
}

function providerHintFromHref(href: string): OauthProviderHint {
  if (/google/i.test(href)) return "Google";
  if (/apple/i.test(href)) return "Apple";
  if (/facebook/i.test(href)) return "Facebook";
  if (/microsoft|live\.com/i.test(href)) return "Microsoft";
  if (/github/i.test(href)) return "GitHub";
  return "Other";
}

/**
 * Classify a clickable control as an OAuth / social sign-in CTA (with provider hint).
 */
export function detectOauthFromControl(el: Element): OauthSignInDetection {
  const tag = el.tagName.toLowerCase();
  const inputType = (el.getAttribute("type") ?? "").toLowerCase();
  const isButtonLike =
    tag === "button" ||
    tag === "a" ||
    el.getAttribute("role") === "button" ||
    (tag === "input" && (inputType === "button" || inputType === "submit"));
  if (!isButtonLike && !el.closest("a,button,[role='button']")) {
    return { detected: false };
  }
  const blob = `${textOf(el)} ${ariaOrTitle(el)}`;
  const fromText = detectFromText(blob);
  if (fromText) {
    return fromText;
  }
  const anchor = el.closest("a") ?? el;
  const href = hrefOf(anchor);
  if (OAUTH_HREF.test(href)) {
    return { detected: true, providerHint: providerHintFromHref(href) };
  }
  return { detected: false };
}

/**
 * True when a clickable control looks like an OAuth / social sign-in CTA.
 */
export function isOauthSignInControl(el: Element): boolean {
  return detectOauthFromControl(el).detected;
}

/**
 * Scan the document (or a subtree) for OAuth / “Continue with …” cues.
 */
export function detectOauthSignInCues(root: ParentNode): OauthSignInDetection {
  const candidates: Element[] = [];
  if (typeof (root as { querySelectorAll?: unknown }).querySelectorAll === "function") {
    candidates.push(
      ...Array.from(
        (root as ParentNode & { querySelectorAll: ParentNode["querySelectorAll"] }).querySelectorAll(
          "a,button,[role='button'],input[type='button'],input[type='submit']",
        ),
      ),
    );
  }
  for (const el of candidates) {
    const blob = `${textOf(el)} ${ariaOrTitle(el)}`;
    const fromText = detectFromText(blob);
    if (fromText) {
      return fromText;
    }
    const href = hrefOf(el);
    if (OAUTH_HREF.test(href)) {
      return { detected: true, providerHint: providerHintFromHref(href) };
    }
  }
  return { detected: false };
}

/** Export for unit tests — classify a free-form label string. */
export function detectOauthFromLabel(label: string): OauthSignInDetection {
  return detectFromText(label.replace(/\s+/g, " ").trim()) ?? { detected: false };
}
