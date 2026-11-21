# First slice (proposed, not frozen)

Status: Proposed. Criteria are not frozen (ADR 0001, D-13). Nothing here is a legal conclusion.

Covers: inventory and classification, purpose and minimization, retention and deletion, evidence and exception envelope.
Machine rules: `rules/first-slice.json`. Evaluator: `node scripts/evaluate.mjs <file> [--now ISO]`. Input schema: `pdg-declarations/0.1.0-proposed`.

## What a clean result means
Only that the declared, examinable surface produced no finding. It does not show the declarations are true or complete, and it is not legal compliance.

## Behaviour
- Gate 0: invalid JSON, wrong schema version, an unknown field or wrongly typed entry anywhere in the declarations (top level, applicability, purposes, datasets, fields, retention) is refused (exit 2), with no verdict. A bad or missing `--now` is also refused.
- Applicability absent: INDETERMINATE. Not-applicable only with a declared basis and a human or legal attestation; otherwise REVIEW_REQUIRED. A not-applicable claim that still declares datasets is a contradiction (REVIEW_REQUIRED). Invalid evidence or exceptions give FAIL under every applicability state.
- A missing checked field is `not-evaluated`, never pass. Indefinite retention needs a complete, unexpired exception.
- Evidence: unknown fields, `live-platform`, an unknown rule or dataset reference all fail `pdg-evidence.envelope-valid` (FAIL, not a gate 0 refusal); agent or tool output is never an attestation or legal review; limitations are mandatory.
- Findings carry a rule ID and index-only pointer. Declared values, ids and unknown keys are never echoed.

## Boundaries (D-15, D-16)
AIStandards owns privacy controls for prompts, traces and eval sets; PDG owns the generic lifecycle and evidence contract.
Android owns SDK and permission inventories and extends the shared data-inventory contract. Reciprocal edits in those repositories are tracked there, not made here.

## Retention period profile
Periods use a restricted ISO 8601 profile: integer Y/M/D/H/M/S designators, or a single integer-week form (`P2W`). Zero periods, week-mixed forms and fractional values are not accepted; `indefinite` needs a complete, unexpired exception.
