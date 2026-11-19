/* Default runtime config for local Vite / static preview.
 * Docker entrypoint overwrites this file from env OKKEY_API_PUBLIC_URL as:
 *   window.__OKKEY_RUNTIME__ = { apiBaseUrl: "<url>" };
 * Empty apiBaseUrl means same-origin (production default). Local Vite uses
 * VITE_API_BASE_URL when apiBaseUrl is omitted.
 */
window.__OKKEY_RUNTIME__ = window.__OKKEY_RUNTIME__ || {};
