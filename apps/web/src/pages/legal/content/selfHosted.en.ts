/**
 * Short self-hosted privacy policy — English HTML body (no company operator fields).
 * Edit this file for production copy; do not inject via env.
 */
export const selfHostedPrivacyHtmlEn = `
<section>
  <h2>About this notice</h2>
  <p>Okkey is end-to-end encrypted password management software. This page describes privacy expectations for self-hosted (non-SaaS) deployments of the open-source Core. It is not a substitute for your organisation’s own privacy policy if you process personal data of others.</p>
</section>
<section>
  <h2>Who is the operator</h2>
  <p>In a self-hosted deployment, the organisation or person that installs and runs Okkey is the service operator. They decide hosting location, access controls, retention, and how to respond to privacy requests. Okkey software authors are not the controller of data on your instance.</p>
</section>
<section>
  <h2>What may be processed</h2>
  <p>Depending on how the operator configures the instance, the service may process account identifiers (such as email), authentication and device metadata, encrypted vault payloads, and operational logs. Exact categories depend on enabled features and your deployment.</p>
</section>
<section>
  <h2>Vault contents and encryption</h2>
  <p>Vault item plaintext is encrypted on the client before sync. The server is designed to store ciphertext and related metadata, not your master password or decrypted vault secrets. Anyone with server access still sees encrypted blobs and account metadata — protect the host accordingly.</p>
</section>
<section>
  <h2>Purposes</h2>
  <p>Typical purposes are providing authentication, syncing encrypted vault data across devices, security features (such as device approval or monitoring), and keeping the service reliable. The operator sets the lawful basis and retention for their users.</p>
</section>
<section>
  <h2>Retention and deletion</h2>
  <p>Retention is controlled by the operator’s infrastructure and product settings (for example backups and account deletion flows). Ask your operator how long logs and account data are kept and how to request deletion.</p>
</section>
<section>
  <h2>Your rights</h2>
  <p>Depending on applicable law, you may have rights to access, correct, export, or delete personal data, or to object to certain processing. For a self-hosted instance, exercise those rights with the operator who runs your deployment.</p>
</section>
<section>
  <h2>Contact</h2>
  <p>Contact the administrator of your Okkey deployment for privacy questions. This self-hosted build does not publish a separate company legal entity or privacy inbox for the software authors.</p>
</section>
`.trim();
