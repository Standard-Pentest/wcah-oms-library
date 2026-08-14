# OMS Configuration and Team Management Design

## Goal

Complete the functional mockup with usable configuration and team-management
workflows driven by the intended data model in
`WCAH Scheduler Data Model.xlsx`, while preserving the PRD v0.7.6 lifecycle
and existing real-world seed data.

## Data-model decisions

The workbook refines the PRD model as follows:

- A **Week** contains seven explicit **Day** configurations.
- Each Day stores its DVM count and an ordered, weighted list of departments
  to resource.
- A **Department** owns one or more **Roles** and default day-specific role
  requirements. The role remains distinct because departments such as Dental
  may require multiple capability levels.
- An **Employee** has one title, target hours, ordered role preferences,
  role-specific weights and burnout limits, unavailable weekdays, a
  consecutive-days-off exemption, notes, and rotation rows.
- A **Rotation** is a multi-week ordered grid. Each day cell is unrestricted,
  OFF, or a role preference. This is the primary standing-pattern input.
- A generated **Shift** links employee, week/date, department, and role.

The mockup keeps the existing normalized collections (`departments`, `roles`,
`resourceNeeds`, `employees`, `roleEligibilities`, `constraints`,
`rotations`) and exposes them through purpose-built editors. It adds
descriptive fields and preference/burnout fields where the workbook requires
them. The generator continues to consume the normalized records.

The PRD lifecycle remains authoritative: DRAFT → FINAL → PUBLISHED. The
workbook's Pending/Finalized/Planned wording is treated as user research, not
a replacement state machine.

## Surfaces

### Week Setup

For the selected week:

- Edit DVM count for every Sunday–Saturday day.
- Configure which departments are resourced each day and their weights.
- Edit each department/role requirement by day as a fixed quantity or
  DVM-based formula.
- Show a live coverage preview after changes.

### Configuration

- Department CRUD: name, description, active state.
- Role CRUD within a department: name, description, minimum title.
- Resource-need CRUD: department, role, day, quantity/formula, weight.
- Department-constraint CRUD: name, type, weight, machine-consumable status,
  and plain-English parameters.
- Deletes are blocked when they would orphan dependent records; departments
  with historical references are deactivated.

### Team

- Team-member CRUD: Paylocity ID, name, title, home department/location,
  target hours, active state, consecutive-off exemption, unavailable days,
  and notes.
- Ordered role preferences: role, weight, burnout threshold, auto-assign.
- Department authorization and location eligibility.
- Rotation-row CRUD: order, anchor date, and seven day cells.
- Synthetic DVM placeholders remain read-only and excluded from this screen.

## Jitter root cause and design

The default `store = createOmsIdbStore()` parameter creates a new store object
on every provider render. Because the load effect depends on `store`, each
render starts another load which updates provider state and renders again.
This is the primary uncontrolled jitter loop.

The fix:

1. Create the default store once at module scope.
2. Memoize the context value.
3. Debounce whole-document persistence by 300 ms.
4. Derive schedule calculations from scheduling inputs, not UI-only state.
5. Cache PTO impact calculations within each render.

## Validation

- IDs and codes are unique.
- Department and role names are required.
- Resource quantities and DVM counts are non-negative integers.
- Weights are integers from 0–100.
- A role belongs to exactly one department.
- Role eligibility cannot exceed the employee title's rank ceiling.
- Removing a role or employee also removes dependent draft preferences and
  constraints, but not published schedule history.
- Unknown constraint types fail loudly.

## Testing

- Reducer tests cover every upsert/delete action and dependency cleanup.
- A regression test proves the provider loads once and debounces rapid saves.
- UI tests cover navigation, DVM editing, department/need CRUD, and employee
  preference CRUD.
- Full Vitest suite and production build must pass.
- Browser smoke test exercises every tab, modal, create/edit/delete flow,
  week navigation, and rapid repeated clicks without layout thrashing.

