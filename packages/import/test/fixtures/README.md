# Import test fixtures

Synthetic exports for manual and automated import testing. **Do not use real passwords in new fixtures.**

## Files

| Path | Format | Used by |
|------|--------|---------|
| `bitwarden/unencrypted.json` | Bitwarden JSON | `bitwardenjson`, `bitwardenzip` |
| `bitwarden/password-protected.json` | Bitwarden JSON (password: `1234`) | encrypted import popup |
| `bitwarden/export.csv` | Bitwarden CSV | `bitwardencsv` |
| `bitwarden/export-with-attachments/` + `.zip` | Bitwarden ZIP with `attachments/att-1/demo.pdf` | `bitwardenzip` |
| `chrome/passwords.csv` | Chrome / Chromium CSV | `chromecsv`, `edgecsv`, `yandexcsv` |
| `lastpass/export.csv` | LastPass CSV | `lastpasscsv` |
| `keepass/database.xml` | KeePass 2 XML | `keepass2xml` |
| `kaspersky/export.txt` | Kaspersky Password Manager TXT | `kasperskytxt` |
| `kaspersky/export.csv` | My Kaspersky CSV | `kasperskycsv` |
| `yandex/passwords.csv` | Yandex Browser CSV | `yandexcsv` |
| `passwork/export.json` | Passwork JSON | `passworkjson` |
| `generic/custom.csv` | Generic CSV | `genericcsv` |
| `bitwarden/export-with-attachments.zip` | Bitwarden ZIP (deflate) | `bitwardenzip` |

## Manual testing in OKKEY web

1. Open `/tools/import`
2. Select target vault and optional personal folder
3. Choose matching format in the dropdown
4. Upload the fixture file (or paste text for CSV/JSON/TXT/XML)
5. Click **Import**

## Getting real exports

- **Bitwarden:** Settings → Export vault
- **Kaspersky:** Desktop app → Export to TXT; My Kaspersky portal → Export to CSV
- **Yandex Browser:** Passwords → Export to CSV or ZIP
- **Passwork:** Settings → Export data → JSON
- **LastPass:** Advanced Options → Export

Delete export files after successful import — they contain secrets in plaintext.
