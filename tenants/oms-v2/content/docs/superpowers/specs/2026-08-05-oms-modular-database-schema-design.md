# OMS Modular Database Schema Design

*2026-08-05. Proposed by Tom; pending Kasey platform review and sign-off.*

**Status:** SUPERSEDED  
**Superseded by:** `docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md` (v2 — full long-term table catalog)  
**Decision owner:** Tom (domain boundaries)  
**Required reviewer:** Kasey (Postgres, migrations, and platform feasibility)

> Keep this file for history. New work and reviews use the 2026-08-07 v2
> document.

## Goal

Keep one OMS application and one PostgreSQL database understandable as
Scheduling, Commission, and future administrative modules are added. A person
viewing the database should be able to identify which data is shared and which
module owns every table.

This design describes ownership and naming. It does not prescribe final DDL,
indexes, or migration mechanics; those remain Track O responsibilities.

## Decision

Use PostgreSQL schemas as module boundaries:

- `core` owns facts shared across OMS modules.
- `scheduling` owns Scheduling-only data.
- `commission` owns Commission-only data.
- Each future module receives its own clearly named schema.

This is the selected “module schemas” approach. It is unrelated to the earlier
Scheduling “Approach A” taxonomy design.

## Naming convention

1. Schema names use the full module name: `scheduling`, not `sched`.
2. Table names are singular entity names without redundant module prefixes:
   `scheduling.rotation`, not `scheduling.scheduling_rotation`.
3. Primary keys use stable surrogate IDs.
4. Foreign keys use the referenced entity name plus `_id`, such as
   `employee_id`.
5. Modules may reference `core`; one module must not hold a foreign key to
   another module's private tables.
6. Cross-module reporting uses views or dedicated read models and does not
   transfer source-of-truth ownership.

## Shared employee model

OMS currently manages employees only, so a separate `person` abstraction is not
justified.

### `core.employee`

Owns the employee's stable identity and universally meaningful facts, including
name, current status, and universal title references.

The employee ID remains stable if an employee leaves and is later rehired.

### `core.employment_period`

Records each period of employment, including hire and termination dates. Rehire
creates a new employment period for the existing employee rather than a new
employee identity.

### Shared supporting entities

- `core.title` owns universal employee titles such as VA, RVT, and DVM.
- `core.location` owns hospital locations.
- `core.employee_location` records organization-level location associations
  when they are facts shared by multiple modules.

A Scheduling role is not an employee title. Assignability such as Dental
Monitor belongs to `scheduling`, even when a universal title constrains who may
fill that role.

## Module-owned employee data

Scheduling-specific employee facts stay in the `scheduling` schema and refer to
`core.employee`:

- target hours used by scheduling policy
- role eligibility
- location eligibility used only for assignment policy
- rotations
- scheduling constraints and preferences

Commission-specific employee facts stay in the `commission` schema:

- commission plans and eligibility
- rates, tiers, and calculation rules
- calculation runs and payout results

A field moves into `core` only when multiple modules use the same fact with the
same meaning. `core` must not become a miscellaneous collection of fields that
merely happen to mention an employee.

## Evolution from the Scheduling document

At SP2, the authoritative Scheduling document remains JSONB. It is owned by
Scheduling and must not absorb Commission data.

Before Commission depends on employee data:

1. Introduce the relational `core` schema and shared employee entities.
2. Move shared employee facts from the Scheduling document into `core`.
3. Keep Scheduling-specific employee configuration in the Scheduling boundary,
   referencing stable core employee IDs.
4. Build Commission in `commission`, also referencing `core.employee`.

This is incremental relational deepening. Shared entities can be extracted when
the second module needs them without converting every Scheduling aggregate to
tables at the same time.

## Boundary tests

Before adding a field or table, ask:

1. Is this a fact about the organization or employee, or policy for one module?
2. Do multiple modules require the same fact with the same semantics?
3. Can the owning module change this representation without breaking another
   module?
4. Is a proposed cross-module dependency actually reporting or integration that
   should use a view, read model, or application interface?

If ownership is ambiguous, keep the data in the module that creates and governs
it until a real shared use case proves otherwise.

## Kasey review gate

This proposal is not finalized until Kasey reviews:

- PostgreSQL schema and migration feasibility
- ORM/Alembic support for per-module schemas
- permissions and migration ownership
- the timing of `core` extraction relative to SP2 and Commission
- compatibility with the existing `schedule_document` and history design

Kasey's approval or requested changes must be recorded in this document or in a
linked pull request. Until then, downstream documents must describe this design
as proposed, not locked.

### Sign-off

- [x] Tom — domain direction approved, 2026-08-05
- [ ] Kasey — platform review pending

## Success criteria

- Database ownership is evident from every table's qualified name.
- Shared employee identity is represented once.
- Rehire history does not create duplicate employee identities.
- Scheduling and Commission can evolve independently.
- No module becomes a dumping ground for another module's data.
- Kasey has reviewed and signed off before the design is marked final.
