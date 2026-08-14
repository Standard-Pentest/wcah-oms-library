# Coverage Needs Model — Rulings

*2026-08-11. Written during the `oms-new` foundation slice design and answered by
Tom the same day.*

**Status:** RULED — all items closed
**Effect:** `default_need` is simpler than schema v2 proposed. See §Schema
consequences.

---

## Project-wide assumption

**The seed data is a slice, not a complete dataset.** It exists to drive the design
conversation. Once there is functional software, the dataset gets completed through
the application.

This assumption governs how every gap below is read. A missing row is not a data
error to be reverse-engineered — it is a row nobody has entered yet. It also sets a
priority: the editing sub-project (follow-on #2) is what makes the assumption true,
so it should not sit behind other work.

---

## The data as converted

The workbook's 67 rows become 65, after dropping two artifact rows (Q2).

| Department | Role | Sun | Mon | Tue | Wed | Thu | Fri | Sat | Weight |
|---|---|---|---|---|---|---|---|---|---|
| ROOM | ROOM_TECH | 4 | 10 | 10 | 10 | 10 | 10 | 4 | 80 |
| SURGERY | SURGERY_TECH | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 80 |
| DENTAL | DENTAL_TECH_JR | — | 1 | 1 | 1 | 1 | 1 | — | 80 |
| DENTAL | DENTAL_TECH_SR | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 50 Sun, else 80 |
| DENTAL | DENTAL_MONITOR | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 50 Sun, else 80 |
| HSS | HSS | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 70 |
| PHARM | PHARM | — | 1 | 1 | 1 | 1 | 1 | — | 70 |
| TECHAPPT | TECH_APPT | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 60 |
| CSR | CSR | 3 | 5 | 5 | 5 | 5 | 5 | 4 | 80 |
| CSR | CSR_ADMIN | — | 1 | 1 | 1 | 1 | 1 | 1 | 70 |

Every row is Linda Vista (Q1). `—` means no row at all, which means no need (Q2).

---

## Q1 — Location scoping for CSR — RULED

**Question.** 13 rows — the whole CSR department — carried no location, which
invariant I14 makes unsatisfiable, since an assignment only satisfies a need at the
same location.

**Ruling.** Front desk staffing is **not** exclusive to Linda Vista. The Linda Vista
focus is a research-and-development choice, not a fact about the hospital. Pacific
Beach gets filled out once the software is functional.

**Consequence.** The 13 CSR rows convert as Linda Vista, matching every other row.
`default_need.location_id` becomes **not nullable** — there is no such thing as a
need without a location, and allowing null would encode "unknown" as a permanent
schema affordance. Pacific Beach needs are new rows entered through the application,
not a schema change.

---

## Q2 — Two encodings of "none" — RULED

**Question.** Dental Junior Tech had explicit `quantity = 0` rows on Sunday and
Saturday; Pharmacy and CSR Admin simply had no rows on their off days. Same intent,
two encodings that behave differently under iteration.

**Ruling.** **Absent means no need.** The zero rows were an artifact of laying the
full week out on a spreadsheet to see it, and were never removed. They carry no
meaning. Some roles are genuinely not needed on some days, and the engine has
nothing to do about that.

**Consequence.** The two zero rows are dropped at conversion, taking the count from
67 to 65. `default_need.quantity` becomes **not nullable with a check that it is
greater than zero**, so the ambiguity cannot reappear. Removing a need means
deleting the row.

---

## Q3 — Does a need carry its own weight? — RULED

**Question.** Schema v2 puts `weight` on `default_need`; PRD v0.7.6 models a need as
a constraint with a weight like any other. The distinction determines whether
coverage is a first-class objective or one weighted rule among many.

**Ruling.** **Weight stays on the need, and it is meaningful.** Roles differ in
business criticality. The hospital cannot run without enough room techs, so if room
tech coverage cannot be met, a dental tech is moved into the vacancy. Lower-weighted
roles are sacrificed to fill higher-weighted ones.

**Consequence.** `default_need.weight` is **not nullable**. It also means the
existing weights are real signal rather than placeholder values: room tech, surgery,
dental, and CSR at 80 are the roles that cannot go unfilled; tech appointments at 60
are the first to give way.

**Carried forward to the engine sub-project.** This ruling describes cross-role
substitution — pulling a qualified person off a lower-weighted need to fill a
higher-weighted one. That behavior is driven by need weight together with
`role_eligibility`, and it is the core of what the generator does. It is recorded
here because it was ruled here, not because it belongs to this slice.

**Small follow-up, not blocking.** Sunday dental drops to 50 for Senior Tech and
Monitor while Junior stays at 80 — worth a glance once the Configuration screen makes
the weights visible, since the two dental roles being weighted differently on the same
day may or may not be intended.

---

## Q4 — The `2 * DVMs` formula — RULED

**Ruling.** No formula or driver model. A need is a number a person enters
(design decision D16). `default_need.formula` does not exist.

**Quantities supplied by Tom, 2026-08-11:** **4 on weekends, 10 on weekdays.** So
Sunday 4, Monday through Friday 10, Saturday 4.

For the record, the workbook's own DVM counts would have produced 4 on Sunday and
Saturday and 8 to 10 on weekdays under the old formula, so the supplied numbers sit
at the top of that range rather than tracking a fluctuating doctor count.

---

## Q5 — The condition mechanism — RULED

**Question.** One row carried `condition = bree_on`. PRD FR-015 says needs may be
conditional on availability.

**Ruling.** **Conditional needs are not a requirement at all.**

**Consequence.** `default_need.condition` is removed from the schema entirely, and
the one value in the workbook is dropped at conversion. This also removes the last
place where an employee's name was embedded in a staffing rule.

---

## Q6 — TECHAPPT — RULED

**Question.** TECHAPPT owns seven need rows but is absent from the canonical seven
departments the domain docs list, which touches PRD open item A10.

**Ruling.** **TECHAPPT is a real department.** It is populated separately.

**Consequence.** Eight departments, confirmed. The department inventory question is
settled for `oms-new` as far as TECHAPPT is concerned. ADMIN remains a department
whose roles do not count toward need, which is consistent and needs no further
ruling.

---

## Q7 — What HSS is — RULED

**Ruling.** **HSS stands for Hospital Support Specialist.** The role is the
equivalent of a phone nurse, and it is a nice-to-have each day rather than a
requirement.

**Consequence.** Labels are corrected at conversion: the role's name becomes
"Hospital Support Specialist" rather than the bare acronym, with `short_label` of
"HSS". PRD open item Q13a is answered.

**Related, now defused.** PRD A2 flagged HSS as operationally fragile — three staff
exactly meeting a requirement of one per day, with no backup trigger defined. Under
a nice-to-have reading that is much less alarming: an unfilled HSS day is a gap
report, not a crisis.

**Small follow-up, not blocking.** HSS currently carries weight 70, the same as
Pharmacy and CSR Admin. If it is genuinely nice-to-have while those are not, the
weight may want to come down — visible and adjustable once the Configuration screen
exists.

---

## Schema consequences

`default_need` is materially simpler than schema v2 proposed. Two columns are gone
and three nullable columns become required:

| Column | Before | After |
|--------|--------|-------|
| `formula` | nullable text | **removed** (D16) |
| `condition` | nullable text | **removed** (Q5) |
| `location_id` | nullable | **not null** (Q1) |
| `quantity` | nullable when formula present | **not null, > 0** (Q2, Q4) |
| `weight` | nullable | **not null** (Q3) |

The table is now six columns of pure meaning: department, location, day, role,
quantity, weight. Every row says one unambiguous thing, and there is no state in
which a need exists but cannot be evaluated.

**Conversion count changes from 67 to 65.** The row-count guard in the design spec
is updated accordingly.

---

## What remains open

Nothing gating. Two items carried forward:

1. **Pacific Beach coverage needs** (Q1). Entered through the application once it
   exists; not a gap in this design.
2. **Two weight sanity checks**, both cosmetic and both easier to judge once the
   Configuration screen renders them: Sunday dental at 50 for two of three roles, and
   HSS at 70 despite being nice-to-have.
