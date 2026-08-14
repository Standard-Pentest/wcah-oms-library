# Legacy MVP stack — quarantined, not deleted

*Moved here 2026-08-04. Nothing in this directory is reachable from
`src/main.jsx`.*

## What this is

The original MVP's UI and state layer. The OMS rewrite (`644fb2f`, 2026-08-02)
replaced the application shell wholesale, and `src/ui/App.jsx` has not mounted
any of these screens since. They kept passing tests and kept looking alive,
which made the codebase read as though two applications were in service when
only one was.

| Directory | Was |
|---|---|
| `ui/` | Month Dashboard, Week Board, Roster, Time Off import, Publish CSV, rail panel, chips, exporters |
| `state/` | `SchedulerStore` reducer, selectors, IndexedDB persistence, `SchedulerContext` |
| `import/` | `ImportAdapter` parsers — Paylocity time off, roster paste |

## Why it was kept

**The tests still run and still pass.** That is the point. These are the only
executable description of how the MVP behaved, and the OMS has no Excel-parity
proof of its own yet, so deleting the older behaviour would destroy evidence
while the replacement is still unverified.

`import/` in particular is not dead by intent: HANDOFF Phase C designates the
`ImportAdapter` contract — `parse(raw) → {records, issues}` — as the seam an AI
ingestion adapter will implement. `paylocity.js` and `roster-paste.js` are its
two reference implementations. They are quarantined because nothing imports
them today, not because the design was abandoned.

## What deliberately did NOT move

`src/domain/` and `src/data/` stay where they are. They are **not legacy** —
they are the frozen Excel-parity oracle that the production migration design
(decision 2) makes the conformance target for every future engine, including
the planned Python port. Moving them here would mislabel the trust anchor as
dead weight.

## The one real coupling

`src/domain/cells.js` is **not** exclusively legacy. The live OMS reaches it:

```
src/seed/buildSeed.js → src/data/roster.js → src/domain/cells.js
```

`roster.js:1` imports `shift` from it. So `cells.js` is a shared dependency of
both the parity oracle and the running product, and editing it changes both at
once. Every other `src/domain/*` module is reachable only from the parity test
and from `legacy/state/store.js`.

## Rules

- **Do not import from `legacy/` into live code.** If something here is worth
  keeping, move it out deliberately rather than reaching in.
- **Do not "improve" it.** It has no product role; changes here can only cost
  fidelity to what the MVP actually did.
- Its tests must keep passing. A failure here means a shared dependency
  (`src/domain`, `src/data`) changed underneath it — which is exactly the
  signal worth having.
