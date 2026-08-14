# OMS Approach B Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the OMS mockup document to nested Approach B (schema v3):
department and employee aggregate roots, week-local need overrides, no
departmentAuths; thin selectors for engine/UI.

**Architecture:** Big-bang cutover. Seed emits nested v3. `omsSelectors.js`
plus nest-aware `activeNeeds` replace flat collection reads. Mutations write
into parent bags. Persistence schema `2 → 3` with mismatch → seed. No
flattener layer, no A→B migrator, no OR-Tools.

**Tech Stack:** React 18, Vite 6, Tailwind v4, JavaScript + JSDoc, Vitest,
Testing Library, IndexedDB.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-oms-approach-b-schema-design.md`
- No `Date.now()` / id generation in `src/domain`, `src/data`, `src/import`, seed/engine pure paths
- Theme token classes only; components at module scope
- Legacy `parity-aug02` / `src/domain` untouched
- No git commits unless Tom explicitly requests them
- Omit vestigial employee `preferences[]`; role eligibilities carry preference metadata
- Team UI: checkbox group for role eligibilities

## File map

| File | Responsibility |
|------|----------------|
| `src/model/omsSelectors.js` (new) | Pure nest → flat helpers |
| `src/engine/activeNeeds.js` | Defaults + departmentsEnabled + needOverrides |
| `src/seed/buildSeed.js` | Emit nested v3 document |
| `src/seed/mapRotations.js` | Attach rotations onto employees (or return by employeeId for seed assembly) |
| `src/state/omsPersistence.js` | SCHEMA 3 |
| `src/state/omsMutations.js` | Nested CRUD + need override actions; drop dept auth |
| `src/state/omsStore.js` | ensureWeek dayPlans shape; dependency arrays |
| `src/engine/generate.js` | Selectors; drop departmentAuth gate |
| `src/engine/ptoImpact.js`, `dayRecommendations.js` | Selectors |
| `src/ui/oms/*` | Nested reads/writes; Week Setup overrides; Team checkboxes |
| Tests beside each module | Red/green for shape, overrides, cascades |

---

### Task 1: Selectors + active needs

**Files:**
- Create: `src/model/omsSelectors.js`
- Create: `src/model/omsSelectors.test.js`
- Modify: `src/engine/activeNeeds.js`
- Modify: `src/engine/activeNeeds.test.js`

**Interfaces:**
- Produces: `allRoles`, `allDefaultNeeds`, `allConstraints`, `allRotations`,
  `allRoleEligibilities`, `allLocationEligibilities`, `findRole`,
  `findDepartment`, `findEmployee`, `employeeDepartmentIds`,
  `activeNeedsForDay(doc, week, day)`, `activeNeedsForWeek(doc, week)`
- Active need shape stays compatible with generator: `{ id, departmentId,
  locationId, dayOfWeek, roleId, formula, quantity, weight, … }`

- [x] **Step 1: Write failing selector + activeNeeds tests** for nested fixture
- [x] **Step 2: Implement selectors and rewrite `activeNeedsForWeek` / add `activeNeedsForDay`**
- [x] **Step 3: Green tests**

Override apply rules:
1. Start from each enabled department’s `defaultNeeds` for that `dayOfWeek`
2. Apply `needOverrides` by `roleId`: merge quantity/formula/weight; `cleared: true` drops the need
3. Days without a dayPlan: no needs for that day (or pass through only if no plan — match prior “no plan ⇒ unfiltered” only if tests require; prefer enabled-dept semantics)

---

### Task 2: Nested seed (v3)

**Files:**
- Modify: `src/seed/buildSeed.js`
- Modify: `src/seed/mapRotations.js` as needed
- Modify: `src/seed/buildSeed.taxonomy.test.js`
- Modify: `src/seed/mapRotations.test.js`

- [x] **Step 1: Failing taxonomy tests** asserting `version: 3`, nested
  `departments[].roles/defaultNeeds/constraints`, nested
  `employees[].roleEligibilities/rotations/constraints/titles/locationEligibilities`,
  top-level absences (`roles`, `resourceNeeds`, `constraints`, `departmentAuths`, …),
  `dayPlans[day].departmentsEnabled` + empty or sample `needOverrides`,
  `hospitalConstraints` present
- [x] **Step 2: Rewrite `buildSeedDocument`** to nest; keep dept/role ids/codes stable
- [x] **Step 3: Green taxonomy + mapRotations tests**

---

### Task 3: Persistence + mutations + store

**Files:**
- Modify: `src/state/omsPersistence.js` (SCHEMA = 3)
- Modify: `src/state/omsMutations.js`
- Modify: `src/state/omsStore.js`
- Modify: `src/state/omsStore.crud.test.js` (+ new override tests)

- [x] **Step 1: Failing tests** for nested upsert/delete cascades, need overrides
  not mutating defaults, schema v3 mismatch, removal of dept-auth actions
- [x] **Step 2: Implement mutations** writing into department/employee bags;
  `UPSERT_NEED_OVERRIDE` / `CLEAR_NEED_OVERRIDE`; constraint `owner` bag;
  `ensureWeek` clones `departmentsEnabled` + `needOverrides`
- [x] **Step 3: Green CRUD tests**

---

### Task 4: Engine cutover

**Files:**
- Modify: `src/engine/generate.js`
- Modify: `src/engine/ptoImpact.js`, `dayRecommendations.js` as needed
- Modify: `src/engine/oms.mockup.test.js`, `generate.hoursFill.test.js`,
  `dayRecommendations.test.js`

- [x] **Step 1: Update fixtures/tests** to nested shape; drop departmentAuth setup
- [x] **Step 2: Replace `doc.roles` / `doc.constraints` / auth gates with selectors + roleEligibilities**
- [x] **Step 3: Green engine tests**

---

### Task 5: UI cutover

**Files:**
- Modify: `src/ui/oms/ConfigurationScreen.jsx` (+ test)
- Modify: `src/ui/oms/TeamScreen.jsx` (+ test) — role eligibility checkboxes
- Modify: `src/ui/oms/WeekSetupScreen.jsx` (+ test) — overrides, `departmentsEnabled`
- Modify: `src/ui/oms/OmsScreens.jsx` and related tests
- Modify: `src/state/OmsContext.oms.test.jsx` if needed

- [x] **Step 1: Configuration / Team / Week Setup / Board** read nested data via selectors
- [x] **Step 2: Week Setup writes overrides; Configuration writes defaults**
- [x] **Step 3: Team role eligibility checkbox group**
- [x] **Step 4: Green UI tests**

---

### Task 6: Full verification

- [x] **Step 1:** `npx vitest run` — all green; `parity-aug02` untouched and green
- [ ] **Step 2:** Manual smoke if time: app boots from seed after schema mismatch

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Nested dept/employee shape | 2 |
| hospitalConstraints | 2, 3 |
| No departmentAuths | 2–5 |
| Selectors | 1 |
| needOverrides / Week Setup | 1, 3, 5 |
| departmentsEnabled rename | 2, 3, 5 |
| Persistence v3 | 3 |
| Engine via selectors | 4 |
| UI minimal chrome | 5 |
| Excel / Propose / day view / PTO inbox | Out of scope |

## Decisions locked for AFK execution

1. No employee `preferences[]` array — only `roleEligibilities`.
2. Day with missing dayPlan contributes no active needs (enabled-dept model).
3. Constraint actions use `owner: 'hospital'|'department'|'employee'`.
4. Role eligibility checkbox defaults: `autoAssign: true`, weight `51`, rank = count+1.
