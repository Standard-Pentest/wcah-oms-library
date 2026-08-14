# Open item — where the practice-level default shift length lives

*Raised 2026-08-13 during the foundation slice, Task 16. Ruled by Tom the same day:
**record it and decide in the next sub-project.** This slice is read-only, nothing
resolves paid hours yet, so nothing is broken meanwhile.*

## The rule, as Tom stated it

> When resource needs are defined for a day, all resources are assumed to work the
> number of hours defined at the practice level for default shift length. This can be
> overridden by a manager to define a custom shift length.

Two halves: a **practice-level default**, and a **per-shift override**.

## What the schema actually has

The override half is modelled properly: `scheduling.rotation_cell.paid_hours` is
nullable and, when set, wins. The V5 workbook already exercises it — cells authored as
`ROOM_TECH/8` parse to an 8-hour paid value against a 10-hour default.

The default half has no home. `core.organization` carries only `code`, `name`,
`week_start_day_id` and `active`. The default shift length lives one level down, on
`scheduling.employee_profile.default_shift_pattern_id`, which is `NOT NULL` — that
non-nullability is deliberate and is what makes D17's resolution chain always terminate
in data rather than in a constant.

So today the practice default is **implied, not recorded**: all 37 employees happen to
point at the single `shift_pattern` row, "Standard 10-hour day", `paid_hours = 10`.

## Why that is worth revisiting

1. **Changing the practice default means updating 37 rows**, not one. There is no single
   place to change "this practice works 10-hour days".
2. **Nothing prevents drift.** The 37 references can diverge, and at that point "the
   practice default" is not a fact the database holds — it is a majority vote.
3. **There is nothing for a settings screen to read.** A Configuration screen wanting to
   show or edit the practice default shift length would have to pick an arbitrary
   employee's profile and treat it as representative.
4. Conversely, the current shape **is** the right one if the intent is that different
   employees legitimately have different default shift lengths — for example part-time
   staff on shorter standard days. That reading is plausible and is why this is a
   question rather than a defect.

## Options when it is decided

- **Add `organization.default_shift_pattern_id`.** This is a new *column*, not a new
  table, so the frozen eighteen-table model in spec §5 survives intact. The practice
  default becomes one fact in one place.
  - The follow-on question is whether `employee_profile.default_shift_pattern_id` then
    becomes nullable, meaning "inherit the practice default". That would weaken D17's
    current guarantee — the chain terminates in data because that column cannot be null
    — so the organization-level column would have to be `NOT NULL` instead, moving the
    terminator up a level rather than removing it.
- **Keep it per-employee and treat the practice default as a UI default only** — a value
  the Configuration screen writes into new employee profiles at creation time, never read
  back as a practice-level truth.
- **Keep it per-employee and accept the implication**: different employees may have
  different default shift lengths by design, and there is no practice-level default at
  all. If this is the answer, the wording of the rule above should change, because "the
  number of hours defined at the practice level" describes something the model does not
  have.

## What must not be lost

Whatever is chosen, D17 stands: the number is data. There is no shift-hour constant in
application code, and the resolution chain must terminate in a stored value rather than a
literal. Task 20 adds a static tripwire for the obvious violation
(`test_no_shift_hour_constant_is_declared_in_application_code`); the behavioural guarantee
— that changing the stored hours changes the schedule, and that a per-cell override beats
the default — belongs to the sub-project that actually resolves hours.

## Related

- `CLAUDE.md`, D17.
- Spec §5.2 `rotation_cell`, §5.3 `employee_profile`.
- Plan finding F5 on rotation-cell hour parsing.
- Task 16's review, which found the test named for D17 did not enforce it.
