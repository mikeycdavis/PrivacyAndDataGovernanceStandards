# ADR 0002: Rule-ID grammar and `pdg-*` domains

Status: **Accepted** under D-02 (owner approval recorded in ADR 0001).

## Context

`privacy.*` is already used by AIStandards and UIUXDesignStandards; `data.*` by EngineeringStandards and MachineLearningStandards;
`evidence.*` by UIUXDesignStandards. A third owner of a shared domain makes bare rule IDs ambiguous in aggregation. Whether StandardsEnforcer
disambiguates by pack qualifier was not verified (PDG-B04 item).

## Decision

Rule ID: `^pdg-[a-z][a-z0-9]*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$` (one domain, one dot, one slug).
Domains: `pdg-inventory`, `pdg-purpose`, `pdg-basis`, `pdg-lifecycle`, `pdg-lineage`, `pdg-risk`, `pdg-telemetry`, `pdg-testdata`, `pdg-evidence`.
No aliasing of any existing rule ID. Prior art for hyphenated domains: UIUXDesignStandards ADR 0007. Whether other packs' catalog tooling admits
this grammar is **unverified**; this repository enforces its own grammar in `scripts/check-catalog.mjs` and does not depend on theirs.

## Consequences

Meta-tests (tests/scaffold.test.mjs) fail on an ID outside the grammar, an unknown domain, or a duplicate ID.
