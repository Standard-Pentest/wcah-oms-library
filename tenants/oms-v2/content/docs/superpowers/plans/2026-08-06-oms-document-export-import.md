# OMS Document Export / Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Export JSON / Import JSON on Configuration so a UI-tuned OMS document can leave the browser and be restored later.

**Architecture:** Reuse `serializeOms` / `deserializeOms` (`{ schemaVersion: 4, doc }`). UI mirrors legacy PublishScreen download + hidden file input. Import is full replace via `REPLACE` after confirm; failures stay local (no dispatch).

**Tech Stack:** React, Vitest + Testing Library, existing OMS persistence helpers

## Global Constraints

- Controls live on Configuration beside Reset to seed (not header nav).
- Format is exactly `serializeOms` / `deserializeOms` — no second format.
- Import is full replace after confirm; cancel / parse failure leave doc unchanged.
- After successful import, reset tab / selected department like Reset.
- Do not change `omsPersistence` API; do not rewrite seed/workbook.
- Do not commit unless Tom explicitly requests it.

---

### Task 1: Configuration export / import UI + tests

**Files:**
- Modify: `src/ui/oms/ConfigurationScreen.test.jsx`
- Modify: `src/ui/oms/ConfigurationScreen.jsx`
- Reuse (no API change): `src/state/omsPersistence.js` (`serializeOms`, `deserializeOms`)

**Interfaces:**
- Consumes: `useOms()` → `doc`, `dispatch`; `serializeOms(doc)` → JSON string; `deserializeOms(json)` → doc or throw
- Produces: buttons **Export JSON** / **Import JSON**; download `wcah-oms-document.json`; `dispatch({ type: 'REPLACE', doc })` on confirmed import

- [x] **Step 1: Write failing tests** for export payload, import success, import cancel, import reject (invalid JSON + wrong schema).

```jsx
it('exports a schema-4 OMS document download', async () => {
  // spy URL.createObjectURL; click Export JSON; parse Blob text;
  // expect deserializeOms(text) to succeed and JSON.parse(text).schemaVersion === 4
});

it('imports a serialized document after confirm', async () => {
  // save modified doc via store; render; import serializeOms(modified) File;
  // confirm true → UI shows modified department name; tab reset behavior
});

it('leaves the document unchanged when import is cancelled', async () => {
  // confirm false → original UI still visible
});

it('rejects invalid or wrong-schema JSON without changing the document', async () => {
  // '{not json' and '{"schemaVersion":1,"doc":{}}' → role="alert" error; original data remains
});
```

- [x] **Step 2: Run tests — expect FAIL** (Export/Import buttons missing).

Run: `npx vitest run src/ui/oms/ConfigurationScreen.test.jsx`

- [x] **Step 3: Implement handlers + header buttons**

Pattern (same shape as `src/legacy/ui/PublishScreen.jsx`):

- Local `download(filename, text, type)` helper
- `fileRef` + hidden `<input type="file" accept="application/json">`
- Local `importError` state; show via existing `ErrorBanner` (or equivalent `role="alert"`)
- Export: `download('wcah-oms-document.json', serializeOms(doc), 'application/json')`
- Import: `deserializeOms(await file.text())` → confirm → `dispatch({ type: 'REPLACE', doc })` → `setSelectedDepartmentId(next.departments[0]?.id)` + `setTab('departments')`; on catch set `importError`
- Header right: outline **Export JSON** + **Import JSON**, then danger **Reset to seed**

- [x] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/ui/oms/ConfigurationScreen.test.jsx`

- [x] **Step 5: Full suite smoke**

Run: `npx vitest run`
