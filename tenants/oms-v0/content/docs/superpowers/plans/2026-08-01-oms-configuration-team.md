# OMS Configuration and Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable, data-driven week setup, configuration CRUD, and team
member CRUD to the OMS functional mockup.

**Architecture:** Keep the normalized in-memory document and add validated
pure reducer mutations. Split the large OMS screen module into focused Week
Setup, Configuration, and Team screens. Stabilize the provider before adding
new high-interaction surfaces.

**Tech Stack:** React 18, Vite 6, Tailwind v4, JavaScript with JSDoc, Vitest,
Testing Library, IndexedDB.

## Global Constraints

- PRD v0.7.6 takes precedence over earlier mockup behavior.
- Workbook relationships govern configuration UI: Week → Day → weighted
  departments; Department → weighted role requirements; Employee → ordered
  role preferences and multi-week rotations.
- `src/domain`, `src/data`, and `src/import` remain pure.
- Components stay at module scope.
- UI uses theme token classes, never raw hex.
- New behavior follows test-first red/green cycles.
- No git commits are created unless Tom explicitly requests them.

---

### Task 1: Provider stability and jitter regression

**Files:**
- Modify: `src/state/OmsContext.jsx`
- Test: `src/state/OmsContext.test.jsx`

**Interfaces:**
- Consumes: `createOmsIdbStore()`, OMS reducer.
- Produces: stable provider with one load and 300 ms debounced saves.

- [ ] Add a failing test with a counting memory store. Render the provider,
  dispatch several UI actions, and assert `load()` runs once.
- [ ] Add a failing fake-timer test asserting three rapid mutations cause one
  save after 300 ms.
- [ ] Run `npx vitest run src/state/OmsContext.test.jsx`; confirm failures are
  caused by repeated store creation/immediate saves.
- [ ] Move the default store to module scope, memoize the provider value, and
  debounce persistence.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Validated configuration and team reducer mutations

**Files:**
- Create: `src/state/omsMutations.js`
- Modify: `src/state/omsStore.js`
- Test: `src/state/omsStore.crud.test.js`

**Interfaces:**
- Produces actions:
  `UPSERT_DEPARTMENT`, `REMOVE_DEPARTMENT`, `UPSERT_ROLE`, `REMOVE_ROLE`,
  `UPSERT_RESOURCE_NEED`, `REMOVE_RESOURCE_NEED`, `UPSERT_CONSTRAINT`,
  `REMOVE_CONSTRAINT`, `UPSERT_EMPLOYEE`, `REMOVE_EMPLOYEE`,
  `SET_EMPLOYEE_TITLE`, `UPSERT_ROLE_PREFERENCE`, `REMOVE_ROLE_PREFERENCE`,
  `UPSERT_DEPARTMENT_AUTH`, `REMOVE_DEPARTMENT_AUTH`, `UPSERT_ROTATION`,
  `REMOVE_ROTATION`, `SET_DAY_DEPARTMENT`.

- [ ] Write failing reducer tests for each collection and dependency cleanup.
- [ ] Write failing validation tests for required names, weight range,
  non-negative quantity, duplicate codes, and title-rank ceiling.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement pure mutation helpers returning `{doc, error}` and expose
  `doc.ui.lastError` for rejected writes.
- [ ] Route action types through the helpers.
- [ ] Re-run focused tests.

### Task 3: Week Setup screen

**Files:**
- Create: `src/ui/oms/WeekSetupScreen.jsx`
- Create: `src/ui/oms/WeekSetupScreen.test.jsx`
- Modify: `src/ui/App.jsx`
- Modify: `src/seed/buildSeed.js`

**Interfaces:**
- Consumes: selected week, `SET_DVM_COUNT`, `SET_DAY_DEPARTMENT`,
  `UPSERT_RESOURCE_NEED`, generated coverage.
- Produces: seven-day editable DVM/department requirement grid.

- [ ] Write failing UI tests for tab navigation and changing Monday DVM count
  from 5 to 4, asserting VA target changes from 12 to 10.
- [ ] Write a failing test for adding/removing a department from a day and
  editing a fixed role quantity.
- [ ] Add explicit `dayPlans` to seeded weeks while retaining `dvmCounts` as
  the engine-compatible projection.
- [ ] Implement the screen with accessible labeled number inputs, department
  checkboxes/weights, role-need rows, and live preview.
- [ ] Run the focused tests.

### Task 4: Configuration screen

**Files:**
- Create: `src/ui/oms/ConfigurationScreen.jsx`
- Create: `src/ui/oms/ConfigurationScreen.test.jsx`
- Modify: `src/ui/App.jsx`

**Interfaces:**
- Consumes/produces normalized departments, roles, resource needs, and
  department/global constraints through Task 2 actions.

- [ ] Write failing tests for creating/editing/deactivating a department.
- [ ] Write failing tests for role CRUD and resource-need CRUD.
- [ ] Write failing tests for constraint name/type/weight editing and visible
  validation feedback.
- [ ] Implement a master/detail layout with Departments, Roles & Needs, and
  Constraints sub-tabs.
- [ ] Re-run focused tests.

### Task 5: Team screen

**Files:**
- Create: `src/ui/oms/TeamScreen.jsx`
- Create: `src/ui/oms/TeamScreen.test.jsx`
- Modify: `src/ui/App.jsx`

**Interfaces:**
- Consumes/produces employees, employee titles, department authorizations,
  role preferences, unavailable-day constraints, notes, and rotations.

- [ ] Write failing tests for adding/editing/deactivating an employee.
- [ ] Write failing tests for title, target hours, unavailable days, and
  consecutive-off exemption.
- [ ] Write failing tests for role preference order, weight, burnout,
  auto-assign, and rotation-row CRUD.
- [ ] Implement searchable master/detail UI excluding synthetic DVMs.
- [ ] Re-run focused tests.

### Task 6: Calculation and UI performance

**Files:**
- Modify: `src/ui/oms/OmsScreens.jsx`
- Modify: `src/engine/ptoImpact.js`
- Test: `src/ui/App.test.jsx`

**Interfaces:**
- Produces stable calculations unaffected by `doc.ui` changes.

- [ ] Add a regression test that rapidly switches tabs and rail tabs without
  repeated persistence loads or DOM remounts.
- [ ] Extract a schedule-input selector and memoize calculations on relevant
  collections only.
- [ ] Reuse one baseline schedule per PTO queue computation instead of
  regenerating it per request.
- [ ] Re-run focused tests.

### Task 7: Verification and usability

**Files:**
- Read diagnostics for all changed files.

- [ ] Run `npx vitest run`.
- [ ] Run `npm run build`.
- [ ] Start or reuse `npm run dev`.
- [ ] Smoke test Week Board, PTO, Hours, Week Setup, Configuration, Team, and
  AI panel at 5174.
- [ ] Exercise rapid repeated clicks, CRUD create/edit/delete, DVM changes,
  week navigation, and persistence reload.
- [ ] Fix any introduced diagnostics or usability blockers and repeat the
  verification commands.

