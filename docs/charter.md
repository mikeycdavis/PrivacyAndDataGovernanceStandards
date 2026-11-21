# PrivacyAndDataGovernanceStandards charter (Proposed; copied from evidence-1, charter issue 1)

Status: **DRAFT for Mike's approval.** Pre-repository staging. Nothing here creates a repository, issue,
label, account or release. Backlog IDs (`PDG-Bnn`) are **draft labels, not issue numbers**; real numbers
are assigned only when issues exist. Every criterion below is **Proposed**; none is frozen.

Written 2026-11-20 (local) / 2026-11-21T03Z. Owner brief: Mike's message in the PrivacyAndDataGovernance
thread. Repository `mikeycdavis/PrivacyAndDataGovernanceStandards` was verified **absent** with `gh repo view`
before drafting; creation is waiting on Mike's own typed authorization (auto mode refused a relayed one).

## 1. Purpose

Own the **cross-cutting privacy and data-governance** standards for the portfolio: what data a system
holds, why, for how long, with what authority, where it came from, who it was shared with, and how it
leaves — as **evidence-backed, machine-checkable where possible, attested where not** statements.

Central principle (inherited): **absence of a detected problem is not evidence of compliance.**

## 2. Final planned Standards repository (owner decision, recorded)

> This is the **final planned** Standards repository. No further Standards repository is proposed or
> created. Future domains begin as issues, profiles or epics inside the existing portfolio unless the
> owner explicitly reopens repository expansion.

Consequence for scope: anything privacy- or data-governance-shaped that today has no home lands **here**
(or in a profile here), not in a new repository.

## 3. What this repository is not

- **Not legal advice and not a legal-compliance determination.** A clean result never means "GDPR /
  CCPA / HIPAA / any statute compliant". Laws are **jurisdictional overlays** (declared, owner-selected,
  attested), never universal engineering rules. Anything needing legal interpretation becomes an
  owner/legal-review decision, not an inferred requirement.
- Not a security standard (Engineering owns it), not a test-evidence standard (SoftwareTesting), not an AI
  behavior standard (AIStandards), not an ML lifecycle standard (MachineLearning). See `03-ownership-and-duplication-map.md`.
- Not a detector library copy: **StandardsEnforcer** owns cross-repo adapters and enforcement.
- Not a consent-management product, DSAR tracker or data catalog. It defines evidence about those, not them.

## 4. Scope (the 20 areas in the brief)

1 inventory/ownership · 2 classification/sensitivity · 3 purpose specification/limitation · 4 minimization ·
5 collection and lawful-use evidence · 6 consent/notice/withdrawal evidence · 7 retention/deletion/disposal ·
8 data-subject-request capability and evidence · 9 dataset/record lineage · 10 sharing/redistribution/licensing/
downstream use · 11 cross-border and jurisdictional overlay declarations · 12 privacy risk assessments and
decision records · 13 de-identification/pseudonymization/re-identification risk · 14 logging/telemetry/analytics/
redaction · 15 production data in dev/test/fixtures · 16 synthetic and generated data disclosure · 17 backup/
archive/replica deletion behavior · 18 data quality where it materially affects privacy or governed use ·
19 AI/ML dataset-governance interfaces · 20 evidence, exceptions, expiry, residual limitations.

Per-area classification (owned here / defer / extension / overlay / source-blocked) is in
`03-ownership-and-duplication-map.md` §3 (planned for this repository; currently only in the external evidence folder).

## 5. Fail-closed principles (proposed defaults; each normative outcome goes to the owner before freezing)

1. Unknown applicability is `INDETERMINATE`, never silently NOT_APPLICABLE.
2. Missing evidence never becomes consent, authorization, deletion, minimization or compliance.
3. Static, ingested, attested and live-platform evidence stay distinct; reports state which surfaces ran.
4. Agent or automated evidence is never represented as human or legal review.
5. A platform export proves only its exact subject, scope, version and retrieval time.
6. Exceptions require owner, rationale, scope, evidence, and expiry/review date; expired = no exception.
7. Detectors never echo secret or personal-data matches (report path, rule ID, class, count, salted-hash
   locator at most — never the value).
8. Fixtures contain only obviously synthetic data.
9. A clean result means only: the declared, examinable surface produced no finding.
10. Live accounts are never accessed and real personal data is never ingested in v1 (non-goal, not a deferral).

## 6. Source gate

Per portfolio rule: a source supports a required/forbidden rule only if it was **opened** (content actually
inspected) with URL, title, publisher, version/date, retrieval date, status, scope and — where a lawful local
copy exists — hash. Abstract-only, inaccessible and paywalled sources cannot support required/forbidden
rules. ISO material is terminology-only unless licensed access is supplied. Current state in `02-source-ledger.md`.

## 7. Planned artifacts (not yet created)

Root: `README.md`, `INSTRUCTIONS.md`, `PROJECT.md`, `VERSION` (`0.1.0`, unreleased), `CHANGELOG.md`,
`package.json` (Node ≥ 18, zero runtime dependencies), `project-policy.yml`. `standards/`, `rules/`,
`schemas/`, `scripts/`, `artifacts/{adr,backlog,governance,local-ci}`, `templates/`, `fixtures/` (synthetic only).
No `LICENSE` (owner decision; absence is deliberate, not an omission). Convention source:
`00-shared-conventions.md` §2 in this staging folder.

## 8. Relationship to the existing portfolio

Consumed through StandardsEnforcer (pinned immutable release + SHA, pack's own evaluator, no copied
detectors). An adapter/applicability entry in StandardsEnforcer is a StandardsEnforcer backlog item.
