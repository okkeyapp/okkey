/* Default runtime config for local Vite / static preview.
 * Docker entrypoint overwrites this file from env OKKEY_API_PUBLIC_URL as:
 *   window.__OKKEY_RUNTIME__ = { apiBaseUrl: "<url>" };
 */
window.__OKKEY_RUNTIME__ = window.__OKKEY_RUNTIME__ || {};
