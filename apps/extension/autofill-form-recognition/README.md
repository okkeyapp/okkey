# Autofill form recognition corpus (measurement)

Measurement harness for login / registration / password-change / OTP form recognition in the browser extension. **This package does not change classifier behaviour** — it only measures the current `classifyAutofillInput` + `findLoginFields` mapping against dual annotations.

## Layout

| Path | In git? | Purpose |
| --- | --- | --- |
| `sites.csv` | yes | Approved corpus (247 sites). Columns: `domain,url,lang,category,form_types,notes,http_status`. |
| `annotations/pages/<pageId>/annotator-a.json` | yes | Annotator A (field selector → role + optional hints). |
| `annotations/pages/<pageId>/annotator-b.json` | yes | Annotator B (independent; empty stubs until filled). |
| `fixtures/*.html` | yes | Synthetic HTML owned by Okkey (not third-party snapshots). |
| `reports/baseline.json` | yes | Frozen metrics from the measured classifier. |
| `reports/threshold.json` | yes | Corpus id + not-worse-than-baseline policy. |
| `cache/` | **no** | Playwright-rendered HTML / DOM snapshots (gitignored). |

Never commit third-party HTML, cookies, or real secrets.

## Metric roles

`username` | `password` | `new-password` | `otp`

An email used to log in is annotated as `username`.

## Metrics

- **(a)** Form fully recognized: every agreed annotated role is assigned to exactly that field; no extra metric role on the form. Identifier-only steps count when the identifier is found and no password role is assigned. Orphan fields outside `<form>` that annotators treat as one form count as one form.
- **(b)** Per-role precision / recall / F1. Denominator `0` → `no data`.
- **(c)** False positives on `search` / `checkout` pages: share of pages where any of the four roles was assigned, plus field count. Card fields alone are not false positives.
- **(d)** Same (a)(b)(c) sliced by annotator language (`RU` / `EN`).

A field/form enters the denominator only when **both** annotators agree. Disagreements are listed in the report and excluded.

## Commands

From `apps/extension`:

```bash
# Unit tests for the runner + annotation validation
yarn corpus:test

# Recompute metrics from committed annotations (hints path; no HTML cache needed)
yarn corpus:metrics

# Capture pages locally into cache/ and draft annotator A (Playwright)
yarn --cwd ../../e2e install:browsers   # once
yarn corpus:capture                     # skips known bot-block rows
yarn corpus:capture --limit 20
yarn corpus:capture --domain en.wikipedia.org

# Refresh committed baseline after a measurement run (maintainers only)
yarn corpus:metrics --write-baseline

# CI gate
yarn corpus:check
```

`yarn test` in this package runs the existing Node unit tests, then `corpus:test`, then `corpus:check`.

## CI strategy

Capturing 247 live third-party sites inside CI is not reliable (anti-bot, TLS, geo, flaky SPA modals). CI therefore:

1. Validates annotation JSON consistency.
2. Recomputes metrics from **embedded field hints** in annotations (same `classifyAutofillInput` / `isNewPasswordField` mapping; no third-party HTML).
3. Fails if any of (a), (b) precision/recall/F1, (c), or the RU/EN slices is **worse** than `reports/baseline.json` (equal passes; no tolerance).
4. Fails if `sites.csv` composition no longer matches `reports/threshold.json` (composition change ⇒ new baseline).

Local Playwright capture remains the reproducible way to refresh annotator A drafts and the HTML cache. Annotator B must be filled independently before corpus agreement metrics leave `no data` for real sites.

## Annotation format

```json
{
  "schemaVersion": 1,
  "pageId": "en.wikipedia.org__abcd1234",
  "url": "https://en.wikipedia.org/wiki/Special:UserLogin",
  "lang": "EN",
  "annotator": "A",
  "status": "annotated",
  "pageKind": "login",
  "forms": [
    {
      "formId": "form-1",
      "selector": "form",
      "fields": [
        {
          "selector": "#wpName1",
          "role": "username",
          "hints": { "type": "text", "id": "wpName1", "autocomplete": "username" }
        }
      ]
    }
  ]
}
```

`status`: `annotated` | `empty` | `blocked` | `uncapturable`.

## Classifier fingerprint

`reports/classifier-fingerprint.json` records the SHA-256 of the classifier sources used for the baseline (`autofillFieldClassify.ts`, `loginFormFields.ts`, `autofillFormDetect.ts`). This measurement PR must not change those files.
