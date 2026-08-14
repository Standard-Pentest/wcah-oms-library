# Drop Home Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant employee home-department data and use ranked role eligibility as the sole scheduling preference source.

**Architecture:** Delete `homeDepartmentId` from the live employee document, UI, seed, and workbook export. Bump persistence from schema 3 to 4 so existing browser documents are rejected and reseeded rather than retaining the stale field.

**Tech Stack:** JavaScript, React, Vitest, ExcelJS, IndexedDB persistence

## Global Constraints

- Keep `homeLocationId`; location has independent scheduling meaning.
- Do not change `src/domain` or workbook parity fixtures.
- Do not commit unless Tom explicitly requests it.

---

### Task 1: Prove the schema no longer contains home department

**Files:**
- Modify: `src/state/omsStore.crud.test.js`
- Modify: `src/state/omsPersistence.test.js`

**Interfaces:**
- Consumes: `seedDocument()`, `serializeOms()`
- Produces: tests asserting employees omit `homeDepartmentId` and payloads use schema 4

- [ ] Add assertions that seeded and newly created employees have no `homeDepartmentId`.
- [ ] Change persistence expectation to schema version 4.
- [ ] Run targeted tests and confirm they fail because production still emits the field/version 3.

### Task 2: Remove the field from live code and workbook export

**Files:**
- Modify: `src/seed/buildSeed.js`
- Modify: `src/ui/oms/TeamScreen.jsx`
- Modify: `src/state/omsPersistence.js`
- Modify: `scripts/export-oms-seed-workbook.mjs`
- Modify: `src/state/omsStore.crud.test.js`

**Interfaces:**
- Consumes: employee role eligibilities and role ranks
- Produces: schema-v4 documents and an Employees sheet without home-department columns

- [ ] Remove `homeDepartmentId` from normal and synthetic employee construction.
- [ ] Remove the Home department editor and new-employee default.
- [ ] Remove `home_department_key` / `home_department_code` export columns and values.
- [ ] Bump `SCHEMA` from 3 to 4.
- [ ] Remove stale test fixtures and run targeted tests to green.

### Task 3: Align design documentation and verify

**Files:**
- Modify: `docs/oms-domain-model.md`
- Modify: `docs/superpowers/specs/2026-08-05-oms-seed-workbook-design.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: documentation declaring ranked role eligibility as the only department preference source

- [ ] Record the field removal and schema-v4 decision.
- [ ] Remove home-department references from workbook documentation.
- [ ] Update the live persistence schema number in repository guidance.
- [ ] Search for stale live references.
- [ ] Run all Vitest tests and the production build.
