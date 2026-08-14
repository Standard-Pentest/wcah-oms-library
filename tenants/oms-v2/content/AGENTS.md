# Shift Scheduling Software Mandate and Core Competencies

## 0\. How to read this file

**Precedence.** This file is the entry point for any agent working in this repo.
On conflict: `AGENTS.md` > `CLAUDE.md` > `docs/decisions/` > `HANDOFF.md`.
`HANDOFF.md` is project history and status — read it for context, never as a
rule source. Where it states a rule that contradicts this file or `CLAUDE.md`,
those win and `HANDOFF.md` is stale; say so rather than following it.
`docs/decisions/` records binding domain rulings, but some files predate
`oms-new`; apply them through each file's oms-new applicability note and the
foundation-slice spec in `CLAUDE.md`, not through mockup surface language
(document envelope, fixed Sunday, un-namespaced codes).

**Operational rules live in `CLAUDE.md`.** Commands, repo layout, and the hard
rules that govern code edits are there and are binding. Read it before changing
anything under `backend/`, `frontend/`, `tools/`, `seed/`, or `infra/`.

**Scope of the mandate.** Sections 1–2 are binding at all times, for product,
spec, and code decisions alike. Every schema, API, seed, and UI change must
conform to them — in particular "no hospital-specific rules or employee data in
the code": all domain data lives in the database and reaches the browser over
HTTP. Consult (stop and raise a spec question rather than proceeding) only
when the mandate appears to conflict with the approved spec or a ruling in
`docs/decisions/`, or when a requested change cannot be done without violating
Sections 1–2. Never deviate from the mandate silently; if it conflicts with
other guidance, the mandate wins and the conflict gets surfaced.

**Fixture and schema design.** Don’t infer the design from the fixture’s current
content. The fixture data is flexible and can be rewritten. First choose the
cleanest table/schema design and make the domain-code set explicit and
unambiguous—preferably as first-class structured data or a converter-generated
manifest. Then update the seed rows, names, and tests to conform to that design.
Avoid heuristic extraction from existing SQL values, so not B or C. If limited
to the listed choices, use A, with the converter generating both the declared
code set and the corresponding seed data from the same source of truth.

## 1\. Mandate of the Software

The software will help general-practice animal hospitals produce workable weekly employee schedules despite conflicts among staffing needs, employee availability, qualifications, rotations, target hours, locations, and time off. Its objective is to reduce manual scheduling effort while preserving managerial accountability: encode repeatable rules as configurable data, generate the best achievable schedule, surface meaningful gaps and policy violations, and defer true exceptions to a human without embedding hospital-specific rules, employee data, or corner-case logic in the code.

## 2\. Core Competencies

### Configurable Constraint and Resource Modeling

The software must represent employee scheduling facts and hospital staffing needs as structured, validated, and maintainable data. Departments, roles, tiers, locations, resource needs, employee eligibility, rotations, target hours, recurrence, and policy weights must be configurable for each hospital rather than hardcoded into the engine. Rules that fit the supported taxonomy should be machine-consumable, while unusual or ambiguous cases should be captured as visible scheduling notes for human resolution. Administrators must be able to add or change employees, departments, needs, and policies without modifying or redeploying source code.

### Weighted, Best-Achievable Schedule Generation

The scheduling engine must combine all active employee constraints with daily hospital resource requirements to generate a complete weekly schedule. A consistent 0–100 weighting model should govern which constraints are preserved and which may be relaxed when conflicts make perfect compliance impossible. The engine should always return its best achievable schedule within a bounded run time, accompanied by shortages, overages, and constraint breaches rather than stopping with an infeasible result. It must account for eligibility, rotations, target hours, locations, coverage needs, and double-booking prevention through generic logic that can be reused across general-practice animal hospitals.

### Explainable Exceptions and Human Governance

Every scheduling tradeoff must be explainable through a plain-language gap and violation list that identifies the affected employee or need, the constraint, its weight, and why it was not satisfied. Lower-priority exceptions may proceed with clear highlighting, while higher-priority violations must be resolved or explicitly authorized before publication. The software should recommend concrete next actions—such as alternative assignments, targeted overrides, or acknowledged gaps—while allowing the manager to decide when the schedule is close enough to use. A draft-to-final-to-published lifecycle must enforce decision gates and retain an audit trail of overrides, approvals, acknowledgments, users, timestamps, and reasons.

### Time-Off Feasibility and Approachable Decision Support

The software must ingest employee time-off requests, evaluate their effect on the current schedule, and determine whether adequate replacement coverage is available. It should honor approved requests, surface pending requests for explicit decisions, compare alternatives, propose makeup shifts when appropriate, and report any remaining gaps rather than silently reversing an approval. Each time-off decision or manual adjustment must immediately recalculate assignments, resource coverage, hours, and violations. These capabilities must be presented through a “crayon-simple” default experience for users with minimal scheduling-system expertise, with advanced rules and configuration available only when deliberately revealed.
