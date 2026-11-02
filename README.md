# Okkey

Okkey is a password manager you run on your own server. The browser encrypts vault items before they are stored. The source is open, under the [GNU Affero General Public License v3.0 or later](LICENSE), and development happens in this public repository.

Run Okkey when you want the server under your control, and when you want to read the code that handles your vault.

## Status

[v1.0.0-beta.2](CHANGELOG.md) is the first public beta. It is not production-ready. An independent security audit has not been done. The browser extension is not part of this release. Published container images are the web app, the API, and the worker.

## Quick start

You need Docker Engine 28.0 or newer, the Docker Compose plugin, and [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) on your `PATH`. Full steps are in [docs/install.md](docs/install.md).

The installer script's default git ref is `dev`. The command below pins both the script and the files it downloads to the tag `v1.0.0-beta.2`, and pins the container tag `1.0.0-beta.2`. Put the variables on the right side of `|`.

```bash
curl -fsSL https://raw.githubusercontent.com/okkeyapp/okkey/v1.0.0-beta.2/deploy/docker/install.sh \
  | OKKEY_REF=v1.0.0-beta.2 OKKEY_IMAGE_TAG=1.0.0-beta.2 bash
```

The installer asks for an email address and saves it as `OKKEY_SALES_EMAIL`. On a machine with no terminal, set that variable on the right side of `|` as well. The container tag `1.0.0-beta.2` is published when the git tag `v1.0.0-beta.2` is created.

When the installer finishes, open the printed web URL. The default is <http://localhost:8080>.

## What you can use

Names below are the English labels in the web app.

- **All items** in a **Personal vault**, organized with **Folders**
- Item types: **Login / Password**, **Secure note**, **Credit card**, **Personal data**, **Passport**, **Secure files**, **API credentials**, **Database**, **Server**, **Wi-Fi router**, **Bank account**, **Crypto wallet**
- **Capsules**. On a default self-hosted server, **Advanced settings** (**Views**, **Time**, **Access**, **Password**, **Approval**) show "Not available on your current plan"
- **Monitoring**
- **Tools**: **Generator** (**Password**, **Passphrase**, **Username**), **Import**, **Export**
- **Master password**, **PIN code**, and **Biometric unlock** on this browser
- Sign-in: **Email confirmation**, **Passkey**, **Hardware key**
- **Two-factor authentication** with an **Authenticator app** and **Backup codes**
- **Recovery key**

**Create vault** for a shared vault, and inviting more workspace members, are unavailable on a default self-hosted server. **Trusted devices** and **Trusted contacts** recovery are unavailable in this release. The web app says those two recovery flows are not available yet.

## How to help

Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, and pull requests. The community standard is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Bug reports, feature requests, and documentation issues use the templates in this repository. Report vulnerabilities in private, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Documentation

- [Install](docs/install.md)
- [Upgrade](docs/upgrade.md)
- [Backup and restore](docs/backup.md)
- [Security model](docs/security-model.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)
