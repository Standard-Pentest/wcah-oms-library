# OMS Seed Workbook Implementation Plan

> ✅ **SHIPPED 2026-08-05 (PR #5). Do not re-run this plan.** Task 3 in
> particular (`npm run seed:workbook`) would **overwrite
> `docs/seed/WCAH_OMS_Seed_Workbook.xlsx`, which Tom is correcting by hand.**
> Kept as an implementation record. Two items shipped against the pre-reversal
> ruling and are now superseded — see `HANDOFF.md` §5 "Known doc↔code drift":
> the `System_Config` sheet, and the overage cap's home.

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Ship a populated Excel seed workbook plus domain-model outline and Track D decision record from live Approach B seed.

**Architecture:** One Node export script calls `buildSeedDocument()`, assigns stable integer workbook keys, and writes hybrid human/machine sheets via `exceljs`. Domain model and decisions are markdown under `docs/`.

**Tech Stack:** Node ESM, `exceljs` (devDependency), existing `src/seed/buildSeed.js`.

## Global Constraints

- Do not edit parity fixtures or `src/domain` to “fix” data.
- Synthetic DVMs stay out of the Employees sheet.
- Location display name is **Pacific Beach** (code `PB`).
- Integer `*_key` columns + stable string ids on the same rows.
- No import script in this plan.

---

### Task 1: Decision + domain outline docs

**Files:**
- Create: `docs/decisions/2026-08-05-track-d-rulings.md`
- Create: `docs/oms-domain-model.md`
- Modify: `HANDOFF.md` (§4 / §5 open questions → decisions)

- [x] Write decision record for overage config, early leave note, Pacific Beach, rotation semantics
- [x] Write domain-model ERD outline template for Tom to complete
- [x] Update HANDOFF open questions to closed rulings

### Task 2: Rename Pacific Beach in seed catalog

**Files:**
- Modify: `src/seed/buildSeed.js` (`LOC_PB.name`)

- [x] Change `Point Beach` → `Pacific Beach`
- [x] Grep for remaining `Point Beach` strings; fix product-facing ones only

### Task 3: Export script + workbook

**Files:**
- Create: `scripts/export-oms-seed-workbook.mjs`
- Create: `docs/seed/` (directory)
- Create: `docs/seed/WCAH_OMS_Seed_Workbook.xlsx` (generated)
- Modify: `package.json` — add `exceljs` devDependency and `seed:workbook` script

- [x] Install `exceljs`
- [x] Implement export: System_Config, catalogs, Employees (role columns), Employee_Rotations, constraints, weeks, time off, README
- [x] Run export; confirm workbook exists
- [x] Spot-check: employee count = 28; Pacific Beach present; overage config = 10; rotation sequences 1-based

### Task 4: Verify

- [x] `node scripts/export-oms-seed-workbook.mjs` succeeds
- [x] Quick Node assert on sheet names / row counts (inline in script log or tiny check)
