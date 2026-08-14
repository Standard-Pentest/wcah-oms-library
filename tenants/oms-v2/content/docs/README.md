# Documentation index

`oms-new` carries the whole `oms/docs` corpus. Nothing was deleted. This index marks
what still governs the project and what is history, because the drift in the corpus
is real (design decision D6).

- **Current** — governs `oms-new`, or is an authoritative model source for it.
- **Superseded** — a later document in this corpus replaces it.
- **Mockup-only** — describes the `../oms` React mockup. Retained for reference; it
  does not govern `oms-new`. In particular the JSONB document envelope, the hardcoded
  seed, and the in-source roster are explicitly rejected (D9, and spec section 1).

## oms-new's own documents

| Document | Status | Note |
|---|---|---|
| `2026-08-11-oms-new-foundation-slice-design.md` | Current | The spec. 23 decisions. Authoritative for this project. |
| `2026-08-11-oms-new-foundation-slice.md` | Current | The implementation plan for that spec. |
| `2026-08-11-coverage-needs-model.md` | Current | Coverage-needs rulings Q1–Q7. All closed. |
| `2026-08-13-practice-default-shift-length.md` | Current | Open question of where the practice-level default shift length lives, recorded 2026-08-13 and deferred to the next sub-project by Tom. |

## Model sources

| Document | Status | Note |
|---|---|---|
| `2026-08-07-oms-modular-database-schema-design.md` | Current | Track D schema v2. Authoritative for the data model (D1), as amended by spec section 5.3. |
| `oms-domain-model.md` | Current | Ubiquitous language and invariants I1–I15. Authoritative. |
| `2026-08-05-track-d-rulings.md` | Current | The rulings that produced I1–I15. |
| `2026-08-05-oms-modular-database-schema-design.md` | Superseded | Replaced by the 2026-08-07 revision. |
| `2026-08-03-oms-approach-b-schema-design.md` | Superseded | Pre-Track-D schema exploration. |
| `2026-08-03-oms-approach-b-schema.md` | Superseded | Plan for the above. |

## Seed and conversion

| Document | Status | Note |
|---|---|---|
| `2026-08-05-oms-seed-workbook-design.md` | Current | Documents the V5 workbook's sheets and columns. Input to the converter. |
| `2026-08-05-oms-seed-workbook.md` | Mockup-only | Plan that produced the workbook exporter in `../oms`. |
| `2026-08-05-nonstandard-shift-hours-design.md` | Current | Origin of the rotation-cell `/HOURS` grammar. |
| `2026-08-05-nonstandard-shift-hours.md` | Mockup-only | Plan for the above, against the mockup. |
| `2026-08-05-drop-home-department.md` | Current | The work that produced invariant I10. |

## Mockup design and delivery

| Document | Status | Note |
|---|---|---|
| `2026-07-24-wcah-scheduler-mvp-design.md` | Mockup-only | Original mockup design. |
| `2026-07-24-wcah-scheduler-mvp.md` | Mockup-only | Plan for the above. |
| `2026-07-27-login-lock-screen-design.md` | Mockup-only | Authentication is punted (spec section 12 item 5). |
| `2026-07-27-login-lock-screen.md` | Mockup-only | Plan for the above. |
| `2026-08-01-oms-taxonomy-workflow-design.md` | Mockup-only | Replaced as a model by Track D; useful for product intent. |
| `2026-08-01-oms-taxonomy-workflow.md` | Mockup-only | Plan for the above. |
| `2026-08-01-oms-configuration-team-design.md` | Mockup-only | The mockup's Configuration and Team. Useful for product intent; no code carried across. |
| `2026-08-01-oms-configuration-team.md` | Mockup-only | Plan for the above. |
| `2026-07-31-oms-mockup-design.md` | Mockup-only | Mockup shell and navigation. |

## Mockup stabilization, conformance, and the document API

| Document | Status | Note |
|---|---|---|
| `2026-08-04-production-migration-design.md` | Mockup-only | Migration path for the mockup's JSONB envelope. Rejected for `oms-new` by D9. |
| `2026-08-04-sp0-sp1-stabilize-and-conformance-design.md` | Mockup-only | |
| `2026-08-04-sp0-sp1-stabilize-and-conformance.md` | Mockup-only | |
| `2026-08-04-conformance-triage-design.md` | Mockup-only | |
| `2026-08-04-conformance-triage.md` | Mockup-only | |
| `2026-08-04-conformance-triage-tom-queue.md` | Mockup-only | |
| `2026-08-06-oms-document-export-import-design.md` | Mockup-only | Export/import of the JSONB document. Not applicable (D9). |
| `2026-08-06-oms-document-export-import.md` | Mockup-only | |
| `2026-08-09-sp2a-document-api-design.md` | Mockup-only | The two-table JSONB API `oms-new` replaces. |
| `2026-08-09-sp2a-document-api.md` | Mockup-only | |
| `2026-08-07-tom-week-review-and-sp2-kickoff.md` | Current | Direction-setting review; context for why `oms-new` exists. |

## Closed by construction

PRD open item **A22** — the vocabulary collision where `CSR` names a department, a role,
and a title — cannot occur in `oms-new`. Canonical identifiers are namespaced by kind at
conversion time (D10), so `department_csr`, `role_csr`, and `title_csr` are three distinct
strings. Recorded here as spec section 6 requires.
