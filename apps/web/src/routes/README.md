# Web SPA routing (`apps/web`)

This folder defines **browser URL paths**, **route tree**, and **guest entry rules** for the Okkey web client (React Router v6). Other agents should follow this pattern so paths, guards, and navigation stay consistent.

## Files

| File | Role |
|------|------|
| `paths.ts` | **Canonical path strings** and small builders (`workspaceShellPath`, `accountLockWithRedirectQuery`, `isDevUiPathname`, …). No React imports. |
| `guestEntryPaths.ts` | **Which paths may render without a Bearer token** (`isAllowedPathWithoutBearerSession`). Must mirror public / flow-specific routes in `AppRoutes.tsx` and `AuthSessionGate`. |
| `AppRoutes.tsx` | **`<Routes>` / `<Route>` tree** only. Uses `paths.ts` for every `path` / `Navigate to`. |

`App.tsx` mounts providers + `AuthSessionGate` + `<AppRoutes />`.

## Rules for new routes

1. **Add a constant** (or builder) in `paths.ts`  
   - Static page: `export const FOO_PATH = "/foo/bar";`  
   - Dynamic: `export function fooDetailPath(id: string) { return `${FOO_PATH}/${encodeURIComponent(id)}`; }`  
   - Do **not** scatter `"/auth/..."` literals in pages or auth code.

2. **Register the route** in `AppRoutes.tsx`  
   - Import the page component.  
   - Use `path={SOME_PATH}` from `paths.ts`.  
   - For redirects, reuse `LegacyNavigate` or `<Navigate to={TARGET_PATH} />`.

3. **Choose access control**  
   - **Guest only** (no Bearer): wrap with `GuestAuthOnly` (same pattern as email / OTP / 2FA).  
   - **Session but no vault unlock** (e.g. lock / restore): no `GuestAuthOnly`; handle missing token inside the page if needed (`Navigate` to `AUTH_EMAIL_PATH`).  
   - **Session + unlocked vault**: nest under `<Route element={<ProtectedVaultLayout />}>`.

4. **Update `guestEntryPaths.ts` if the route is reachable without a Bearer**  
   Extend `isAllowedPathWithoutBearerSession` with the same pathname checks you added to the router. If you skip this, `AuthSessionGate` will send guests to `AUTH_EMAIL_PATH` before the page renders.

5. **Navigation**  
   - `navigate(SOME_PATH)` / `<Link to={SOME_PATH}>` — import from `paths.ts`.  
   - For lock redirect with return URL: `accountLockWithRedirectQuery(encodeURIComponent(pathWithQuery))`.

6. **Tests**  
   - Prefer importing path constants from `paths.ts` in tests instead of duplicating strings.

## Legacy URLs

Deprecated paths stay in `paths.ts` with a `@deprecated` comment. Register a `<Route path={LEGACY_PATH} element={<LegacyNavigate to={CANONICAL_PATH} />} />` so bookmarks keep working.

## Related helpers (outside `routes/`)

- `auth/safeRedirect.ts` — validates `?redirect=`; use `DEFAULT_AUTHENTICATED_PATH` as fallback when calling `safeRedirectPath`.

## Checklist (copy for PRs)

- [ ] New path constant or builder in `paths.ts`  
- [ ] Route added in `AppRoutes.tsx`  
- [ ] `guestEntryPaths.ts` updated if route is public / flow-gated without Bearer  
- [ ] No new raw `"/..."` path strings in `src/` (except inside `paths.ts`)  
