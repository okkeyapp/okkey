Before implementing any feature read:

- ARCHITECTURE.md

## Import Rules
- apps → can import packages
- packages → can import types
- services → can import packages/types
- packages → CANNOT import apps

## Core Architecture Principles
1. All cryptographic operations are performed only in Rust crypto engine.
2. Backend never has access to decrypted vault data.
3. All clients use a single Vault SDK.
4. Synchronization is implemented via event log.
5. All applications use shared packages.

## Tailwind Rules
- UI must be built with Tailwind CSS utility classes. Avoid custom CSS unless Tailwind cannot express the required styling.
- Prefer design tokens via Tailwind config (colors, spacing, typography) over inline arbitrary values.
- Keep class lists readable: group by layout, spacing, typography, color, effects.

## TypeScript Rules
- TypeScript is the default for frontend/backend; keep strict typing and avoid `any`.
- Prefer explicit types for public APIs and shared package exports.
- Use `unknown` with proper narrowing instead of `any`.

## React Rules
- Prefer functional components and hooks.
- Keep business logic in shared packages/hooks; keep components focused on UI.
- Prefer shared UI components from `packages/ui` over app-local components.

## React Native Rules
- Use platform-specific components only when necessary; otherwise keep shared logic in packages.
- Avoid direct native module access from app code; go through shared packages.
- Keep UI consistent with web where possible; reuse shared design tokens.

## Tauri Rules
- Keep desktop-specific code isolated; no leakage into shared packages.
- Use Rust sidecars/plugins only when web APIs are insufficient.
- Avoid blocking calls in the Tauri command handlers; prefer async.

## Rust Rules
- Backend must not implement or replicate cryptography; use the Rust crypto engine via `packages/crypto`.
- Keep unsafe code to a minimum and document invariants.
- Prefer explicit error types and avoid panics in production paths.

## General Rules
- Do not introduce direct cross-app imports; follow the import rules above.

## Security Rules
- Never send master password or raw keys to the server.
- Encrypt/decrypt only on client.
- For shared vaults: vault key per vault, encrypted per user.

## Testing Expectations
- Update/add tests for critical logic (crypto, access control, routing).
- Run `yarn test` for unit/integration and `yarn test:e2e` when UI flows change.

## Commit Rules
- Follow Conventional Commits: `<type>: <short description>` in English.
- Keep subject under 72 characters, imperative mood.
- Prefer single-line commit messages.
- Allowed main types: `feat`, `fix`, `chore` (optional: `docs`, `style`, `refactor`, `test`, `perf`, `ci`).
- Never commit or push unless explicitly instructed.
