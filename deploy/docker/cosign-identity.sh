# Shared cosign keyless OIDC identity constants for install.sh and the update agent.
# Source this file; do not edit the regexps in only one caller.
# Keep in sync with services/api/src/update-agent/cosign-identity.ts
# (scripts/test/cosign-identity-regexp.test.mjs).
#
# Core: .github/workflows/publish-images.yml on okkeyapp/okkey.
# Enterprise: same workflow on okkeyapp/okkey-enterprise.
#
# Default (both): refs/tags/v<semver>, refs/heads/release/<name>, refs/heads/hotfix/<name>.
# Not refs/heads/dev. OKKEY_ALLOW_CANDIDATE / --allow-candidate is a compatibility
# no-op (same trust set as default).
# OKKEY_COSIGN_ALLOW_DEV=1 / --allow-dev adds refs/heads/dev (process env / CLI only;
# not read from .env).
# Anchored with ^...$ because cosign matches the regexp as a substring.
# OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP overrides Core only.
# OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP overrides Enterprise only.

OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
# Alias kept for callers / tests that still ask for "candidate"; same as default.
OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'

OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey-enterprise/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey-enterprise/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_ENTERPRISE_CANDIDATE_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey-enterprise/\.github/workflows/publish-images\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'
OKKEY_COSIGN_ENTERPRISE_CANDIDATE_DEV_IDENTITY_REGEXP='^https://github\.com/okkeyapp/okkey-enterprise/\.github/workflows/publish-images\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$'

OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER_DEFAULT='https://token.actions.githubusercontent.com'
