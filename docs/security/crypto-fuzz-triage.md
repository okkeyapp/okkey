# Crypto Fuzz Triage Runbook (6.13)

This runbook defines how to triage crashes found by hybrid fuzz/property suites.

## Scope

- Rust fuzz harnesses in `rust/crypto-engine/fuzz/fuzz_targets/`.
- Property/contract tests in `rust/crypto-engine/src/property_tests.rs` and `packages/crypto/test/`.

## Crash handling workflow

1. Capture the failing artifact:
   - fuzz target name;
   - seed and command line (`-seed`, `-max_total_time`);
   - crashing input path/content (`artifacts/<target>/...`);
   - commit SHA and toolchain versions.
2. Reproduce locally with the exact command and seed.
3. Minimize input (`cargo fuzz tmin`) and store minimized sample in the issue context.
4. Classify impact:
   - memory safety / panic;
   - malformed-input parsing bug;
   - cryptographic contract breakage;
   - false positive/non-reproducible.
5. Implement fix and add a regression test:
   - Rust unit/property test and/or TS contract test depending on layer.
6. Re-run:
   - `yarn test:crypto:property`
   - `yarn test:crypto:contracts`
   - `yarn fuzz:crypto:quick`
7. Close only when reproducibility is verified and regression test is merged.

## Required incident artifacts

- exact command used to reproduce;
- seed value and runtime budget;
- minimized crashing input;
- stack trace or error output;
- linked fix commit and regression test file.

## Reproduction commands

```bash
yarn fuzz:crypto:quick
yarn fuzz:crypto:extended
```

To replay one target deterministically:

```bash
cargo +nightly fuzz run --manifest-path rust/crypto-engine/fuzz/Cargo.toml hybrid_decode -- -seed=1337 -max_total_time=20
```
