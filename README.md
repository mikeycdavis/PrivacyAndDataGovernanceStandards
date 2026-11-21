# PrivacyAndDataGovernanceStandards

Cross-cutting **privacy and data-governance** standards for the Standards portfolio: what data a system holds, why, for how long,
with what authority, where it came from, who received it, and how it leaves, as evidence-backed statements that are machine-checked
where possible and attested where not.

**Absence of a detected problem is not evidence of compliance.** A clean result means only that the declared, examinable surface
produced no finding.

- **Not legal advice. Does not establish legal compliance.** Laws are jurisdictional overlays, never universal engineering rules.
- **Final planned Standards repository.** No further Standards repository is planned. Future domains begin as issues, profiles or epics
  in the existing portfolio unless the owner explicitly reopens repository expansion.
- Status: **0.1.0, unreleased. All criteria are Proposed.** No license file by owner decision.
- Rule domains use the `pdg-*` prefix ([ADR 0002](docs/adr/0002-rule-id-grammar.md)).
- Decisions: [ADR 0001](docs/adr/0001-owner-decisions-d01-d14.md). Charter: [docs/charter.md](docs/charter.md).

## Commands

```powershell
node --test
node scripts/check-all.mjs
```

Node 18 or later. Zero runtime dependencies.
