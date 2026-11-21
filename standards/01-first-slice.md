# First slice (proposed, not frozen)

Status: Proposed. Criteria are not frozen (ADR 0001, D-13). Nothing here is a legal conclusion.

Covers: inventory and classification, purpose and minimization, retention and deletion, evidence and exception envelope.
Machine rules: `rules/first-slice.json`. Evaluator: `node scripts/evaluate.mjs <file> [--now ISO]`. Input schema: `pdg-declarations/0.1.0-proposed`.

## What a clean result means
Only that the declared, examinable surface produced no finding. It does not show the declarations are true or complete, and it is not legal compliance.

## Behaviour
- Gate 0: invalid JSON, wrong schema version, unknown top-level field or wrong container type is refused (exit 2), with no verdict.
- Applicability absent: INDETERMINATE. Not-applicable only with a declared basis and a human or legal attestation; otherwise REVIEW_REQUIRED.
- A missing checked field is `not-evaluated`, never pass. Indefinite retention needs a complete, unexpired exception.
- Evidence: unknown fields and `live-platform` are refused; agent or tool output is never an attestation or legal review; limitations are mandatory.
- Findings carry a rule ID and index-only pointer. Declared values, ids and unknown keys are never echoed.

## Boundaries (D-15, D-16)
AIStandards owns privacy controls for prompts, traces and eval sets; PDG owns the generic lifecycle and evidence contract.
Android owns SDK and permission inventories and extends the shared data-inventory contract. Reciprocal edits in those repositories are tracked there, not made here.
