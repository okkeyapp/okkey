# Q-Day Release Policy (Core)

This document defines release gates for the first production release with `Q-Day-ready by default`.

## Policy Statement

- First production release accepts only `crypto_version=v2` for production encrypted write paths.
- Silent downgrade and legacy fallback are prohibited in production.
- Legacy client-data compatibility is not a first-release production obligation.
- `v1` is allowed only in explicitly scoped dev/test fixtures.
- Enterprise extensions cannot override or weaken this policy.

## Release Gates (Blocking)

### Gate 1: Crypto Profile Enforcement

- `stage` and `prod` accept only `v2` for new encrypted writes.
- Downgrade attempts are rejected (`CRYPTO_PROFILE_NOT_ALLOWED`, `CRYPTO_DOWNGRADE_NOT_ALLOWED`).
- `EncryptedBlob` validation is mandatory for all critical encrypted artifacts.
- Crypto profile selection in SDK must go through the versioned registry resolver (`getCryptoConfig`), not ad-hoc version branching.

References:
- `docs/architecture/03_crypto_architecture.md`
- `docs/architecture/08_security_model.md`
- `docs/architecture/14_crypto_v2_qday.md`
- `docs/api_contracts.md`

### Gate 2: Hybrid Transport and Runtime Integrity

- Hybrid envelope contract is canonical and versioned.
- Decrypt/encrypt hybrid path is implemented in Rust/WASM primitives only.
- No JS/TS crypto fallback is allowed for hybrid/PQ operations.
- Edge/ingress transport posture follows the TLS/transport Q-Day runbook for
  strict profile + explicit compatibility exceptions.

References:
- `docs/architecture/14_crypto_v2_qday.md`
- `packages/crypto`
- `rust/crypto-engine`
- `docs/security/6.19-tls-transport-qday-runbook.md`

### Gate 3: Rotation and Event-Log Safety

- Rotation remains mandatory for access changes and incidents.
- Event stream floor for crypto version is monotonic.
- Replay/outbox behavior must preserve anti-downgrade invariants.

References:
- `docs/architecture/05_sync_architecture.md`
- `docs/architecture/08_security_model.md`
- `docs/api_contracts.md`

### Gate 4: Security and Fuzz Evidence

- Security suite is blocking in CI.
- Hybrid fuzz/property/contract tests are blocking in quick lane.
- Extended fuzz lane runs nightly/manual and follows triage process.

References:
- `docs/security/6.12-threat-to-test-matrix.md`
- `docs/security/crypto-fuzz-triage.md`
- `.github/workflows/crypto-fuzz-quick.yml`
- `.github/workflows/crypto-fuzz-extended.yml`

## Readiness Checklist (First Production Release)

- [ ] All production write APIs reject `v1` and malformed envelopes.
- [ ] No production path performs silent fallback to weaker crypto profile.
- [ ] Hybrid envelope validation and Rust/WASM-only crypto path are enforced.
- [ ] Production edge TLS policy follows 6.19 runbook and has validated rollback checklist.
- [ ] Rotation and replay invariants are verified for sharing/sync flows.
- [ ] Security suite and crypto fuzz quick suite pass on release candidate.
- [ ] Core/Enterprise boundary docs explicitly state no enterprise override of crypto policy.
- [ ] Architecture docs use the same wording: `Q-Day-ready by default`, `no legacy client-data obligations`.

## Traceability (Task -> Evidence)

- `6.1` Baseline policy (`v2` by default) -> env policy + API checks + tests.
- `6.2` Mandatory `EncryptedBlob` -> DTO/API/OpenAPI + validation tests.
- `6.3` Versioned envelopes on critical entities -> contracts + replay tests.
- `6.4` Anti-downgrade policy -> server/SDK reject downgrade paths.
- `6.5` Hybrid identity key model (ECC + PQ public keys) -> registration/unlock tests.
- `6.6` Rust hybrid primitives + PQ keygen -> Rust/WASM tests.
- `6.7` Version-aware SDK API + stable errors -> cross-layer integration tests.
- `6.8` Hybrid-by-default sharing -> integration + negative tests.
- `6.9` Vault crypto floor invariants -> schema + sync/sharing checks.
- `6.10` PQ-aware rotation endpoints -> integration/security/concurrency tests.
- `6.11` Atomic rotation via event log -> append/replay invariants tests.
- `6.12` Security suite -> blocking CI security job.
- `6.13` Fuzz/property/contract suite -> blocking quick lane + extended lane.
- `6.19` TLS/transport Q-Day plan -> runbook + staged validation + rollback checklist.
  - execution evidence: `docs/security/6.19-tls-transport-qday-evidence.md`

This checklist is release-blocking for the first production launch.
