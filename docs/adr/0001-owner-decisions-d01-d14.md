# ADR 0001: Owner decisions D-01 to D-16

Status: **Accepted by the owner** (Mike, 2026-11-20 local, 2026-11-21T03:09Z; thread message `cmsg_01S962nAgzeF44i1MHDz4h1uEiGGTzor4XytdNDcWYr5a1`).
Source packet: `F:\GitHub Evidence\PrivacyAndDataGovernanceStandards\evidence-1\05-PDG-owner-decision-packet.md`.
The owner approved all recommendations, with the D-04 refinement below. D-15 and D-16 were decided afterwards (see end). The filename keeps its original d01-d14 name; the content covers D-01 to D-16.

| ID | Decision (as approved) |
| --- | --- |
| D-01 | Keep the name `PrivacyAndDataGovernanceStandards`. |
| D-02 | Hyphenated `pdg-*` rule-ID domains. Grammar recorded in ADR 0002. |
| D-03 | Rule outcomes: pass, fail, indeterminate, not-applicable (only with declared and attested basis), review-required, plus `not-evaluated` for an absent checked field. No "compliant" outcome. |
| D-04 | Evidence envelope: adopt the proposed field set, unknown fields refused, **aligned to the shared SoftwareTesting core evidence schema wherever fields overlap**, with PDG-specific extensions only for privacy and data-governance concepts. See "D-04 alignment" below. |
| D-05 | Declared, owner-defined data classes with a small recommended base set; legal categories only as overlays. |
| D-06 | v1 offers only the jurisdictional-overlay **declaration mechanism**; no overlay content rules. |
| D-07 | Consent and withdrawal: record presence of a record and of a withdrawal path; never validity. |
| D-08 | Retention/deletion evidence: declared period, trigger, mechanism, backup/replica statement, referenced test evidence. |
| D-09 | Lineage and downstream-use: shared minimal fields; MachineLearningStandards keeps ML lifecycle. |
| D-10 | ML privacy, consent and licensing gaps are adoption candidates. The citation is `F:\GitHub Evidence\MachineLearningStandards\evidence-44\findings.json` (SHA-256 `550d3c421ba1f3be1107bcd74416b08b619248fae0f8b9c98328a3fed484a73d`; 84 findings, all 13 cross-referenced items present). Tracked in PDG-B18 (issue 2). No ML change is made here. |
| D-11 | First adopter: MachineLearningStandards (read-only, commit-pinned). |
| D-12 | Version `0.1.0`, unreleased; no tag or release. |
| D-13 | First slice: inventory and classification, purpose and minimization, retention and deletion, evidence and exception envelope. |
| D-14 | Staging copy retained after the hash-verified copy to `evidence-1`. |

## D-04 alignment (what is and is not aligned)

The SoftwareTesting core schema is **not frozen**: `SoftwareTestingStandards` PR 24 merged at `01d797a` but the schema remains unfrozen
(owner message). The only available reference is the proposal `docs/design/swt-b04-evidence-envelope-proposal.md`, which carries open points
(field names differ between its table and its fixtures). Therefore:

1. Overlapping concepts reuse the proposal's vocabulary: surfaces `static`, `ingested`, `attested`; `evidence.kind` `automated` or `manual`;
   retention `location` and `hash`; an absent checked field yields `not-evaluated`, never pass.
2. Privacy-specific concepts (`subject`, `purposeRef`, `datasetRef`, `retentionRef`, reviewer role `legal`, exception object) live under
   a `pdg` extension namespace and never redefine a shared field.
3. The PDG envelope is versioned `0.1.0-proposed` and is **not frozen**. Field-level alignment is re-checked when the SoftwareTesting schema freezes;
   a mismatch then is a PDG change, not a silent drift.
4. `live-platform` is not a legal surface in v1; an envelope declaring it is to be refused (enforced by the evaluator arriving in the first-slice PR; no envelope check exists in the scaffold).

## Held under every decision

Legal conclusions; sources that are unopened, abstract-only or paywalled backing required or forbidden rules; schema and acceptance-criteria freeze;
adopter modification; merge, ready-for-review, release, tag, license; live accounts; real personal data.

## D-15 and D-16 (added after the packet; approved 2026-11-21T03:11Z, message `cmsg_01S962nAgzeF44i1MHDz4h1uFCSpHY7jcDsg5SrbrxrG9a`)

| ID | Decision (option A as approved) |
| --- | --- |
| D-15 | AIStandards owns privacy controls for prompts, traces and eval sets (its standard 07). PDG owns the generic lifecycle and evidence contract. Reciprocal cross-references are added **without changing AI behavior**. PDG rules never restate AIStandards `privacy.*` rules. |
| D-16 | Android owns platform-specific SDK and permission inventories. PDG owns the shared data-inventory contract that Android extends (extension, not redefinition). Apple and Azure follow the same pattern. |

Consequence in this repository: the PDG side of the cross-references will be recorded here as `crossReferences` entries on rules (rules arrive in a later PR) and in the ownership map (currently in the evidence folder, not yet in this repository).
The AIStandards and AndroidDevelopmentStandards side lives in those repositories and is **not edited from here**; it is tracked as a follow-up item in each owner's backlog.
