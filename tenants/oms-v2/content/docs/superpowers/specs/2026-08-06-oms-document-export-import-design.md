# OMS document Export / Import

*2026-08-06. Small persistence affordance so a UI-tuned working dataset can
leave the browser and be handed back for seed integration.*

## Goal

Let Tom export the live OMS document from Configuration after fine-tuning in
the app, and import a previously exported file to restore that document.
The download is the handoff artifact for integrating a new seed into the
codebase; **rewriting `src/seed` / the workbook is out of scope** for this
feature.

## Context

OMS autosaves to IndexedDB (`wcah-oms-mockup`, schema 4) via
`src/state/omsPersistence.js`. Edits survive reload in that browser but are
not in git. The legacy MVP had JSON backup on Publish; the live OMS stack
does not. Seed curation today is Excel-first
(`docs/seed/WCAH_OMS_Seed_Workbook-V5.xlsx`); import-from-workbook is still
follow-on. This feature closes the UI → file gap without inventing a second
format.

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Controls live on **Configuration**, beside **Reset to seed** (not the header). |
| 2 | Format is the existing persistence wrapper: `serializeOms` / `deserializeOms` — `{ schemaVersion: 4, doc }`. |
| 3 | Import is **full replace** after confirm (same severity as Reset). No merge. |
| 4 | Wrong `schemaVersion` or invalid JSON → show error; leave current doc unchanged. |
| 5 | After successful import, reset Configuration local UI state (tab / selected department) the same way Reset does. |
| 6 | Autosave continues to persist the imported doc; no special store path. |
| 7 | Seed / workbook rewrite from the JSON is a **separate** later step. |

## Behavior

### Export JSON

- Button label: **Export JSON**.
- Downloads `wcah-oms-document.json` as `application/json`.
- Body is `serializeOms(doc)` (strips ephemeral PTO preview UI fields, as today).

### Import JSON

- Button label: **Import JSON**.
- Hidden file input: `accept="application/json"`.
- On file select: read text → `deserializeOms`.
  - On success: `window.confirm('Replace all OMS data with this file?')`.
    - OK → `dispatch({ type: 'REPLACE', doc })`, then align local selection like Reset.
    - Cancel → no change.
  - On failure (parse / version mismatch / bad shape): show an error on the
    Configuration screen; do not dispatch.

### Reset to seed

Unchanged. Remains the danger control on the same header row.

## UI placement

Configuration page header row:

- Left: title + short description (unchanged).
- Right: **Export JSON** and **Import JSON** as neutral outline buttons;
  **Reset to seed** stays the danger-styled control.

## Files

| File | Change |
|---|---|
| `src/ui/oms/ConfigurationScreen.jsx` | Export / Import buttons + handlers |
| `src/ui/oms/ConfigurationScreen.test.jsx` | Export / import success, cancel, reject cases |
| `src/state/omsPersistence.js` | No API change — reuse `serializeOms` / `deserializeOms` |

## Testing

1. **Export** — clicking Export triggers a download whose payload
   `deserializeOms` accepts and reports `schemaVersion: 4`.
2. **Import success** — importing a `serializeOms`-wrapped modified document
   (confirm = true) updates the Configuration UI to show that data.
3. **Import cancel** — confirm = false leaves the document unchanged.
4. **Import reject** — wrong schema or invalid JSON shows an error and leaves
   the document unchanged.

## Out of scope

- Seed rewrite script from exported JSON
- Selective / merge import
- Header nav placement
- Workbook round-trip
- Changing persistence schema version

## Agent handoff

After fine-tuning: **Export JSON** → drop `wcah-oms-document.json` in the
repo or attach in chat → agent integrates into seed / workbook as a planned
follow-on.
