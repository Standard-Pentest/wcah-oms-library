# Shift Scheduling Software Mandate and Core Competencies

## 0\. How to read this file

**Precedence.** This file is the entry point for any agent working in this repo.
On conflict: `AGENTS.md` > `CLAUDE.md` > `docs/decisions/` > `HANDOFF.md`.
`HANDOFF.md` is project history and status — read it for context, never as a
rule source. Where it states a rule that contradicts this file or `CLAUDE.md`,
those win and `HANDOFF.md` is stale; say so rather than following it.

**Operational rules live in `CLAUDE.md`.** Commands, repo layout, and the hard
rules that govern code edits are there and are binding. Read it before changing
anything under `src/`.

**Scope of the mandate.** Sections 1–2 govern *product and spec* decisions —
what to build and what "done" means. They are not licence to change code. In
particular, the mandate's "no hospital-specific rules or employee data in the
code" describes the destination for the **engine**; it is not an instruction to
genericize `src/data` or `src/seed`, which are frozen Excel-parity ground truth
pinned by `src/data/parity-aug02.test.js`. If the mandate appears to require
touching them, stop and raise it as a spec question rather than editing.

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

