## Task 8: Frontend — action classifier + completeness guard

**Files:**
- Create: `src/state/omsActionClass.js`
- Test: `src/state/omsActionClass.test.js`

**Interfaces:**
- Produces: `classifyAction`, `SCHEDULING_MUTATIONS`, `LOCAL_ONLY_ACTIONS`, `SYSTEM_ACTIONS`.

**Classification rationale:** an action is `scheduling` if it can change the persisted projection (anything `applyOmsMutation` handles, plus week-setup / PTO-decision / finalize / publish / DVM-team, plus `JUMP_TO_WEEK` and `THIS_WEEK` because they call `ensureWeek`, which creates a draft week — a persisted change). It is `local` if it only touches `doc.ui` (`SET_SCREEN`, `SELECT_WEEK`, `SHIFT_WEEK`, `TOGGLE_AI`, `SELECT_PTO`, `PREVIEW_PTO`, `CLEAR_PTO_PREVIEW`). `REPLACE` is `system` (hydration/reload/reset apply it; the guard always allows it and the equal-projection no-op keeps it from writing).

- [ ] **Step 1: Write the failing completeness test**

Create `src/state/omsActionClass.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyAction } from './omsActionClass.js';

// Every action type the reducer or applyOmsMutation switches on must be
// classified. This test fails when a new action is added without a class.
function actionTypesInSource() {
  const files = ['src/state/omsStore.js', 'src/state/omsMutations.js'];
  const types = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/case '([A-Z_]+)':/g)) types.add(m[1]);
  }
  return [...types];
}

describe('classifyAction', () => {
  it('classifies every reducer/mutation action type', () => {
    for (const t of actionTypesInSource()) {
      expect(['scheduling', 'local', 'system']).toContain(classifyAction(t));
    }
  });
  it('throws on an unknown action', () => {
    expect(() => classifyAction('NOT_A_REAL_ACTION')).toThrowError(/unclassified/);
  });
  it('treats week-setup edits as scheduling and navigation as local', () => {
    expect(classifyAction('SET_DVM_COUNT')).toBe('scheduling');
    expect(classifyAction('JUMP_TO_WEEK')).toBe('scheduling'); // ensureWeek creates a draft week
    expect(classifyAction('SHIFT_WEEK')).toBe('local');
    expect(classifyAction('SET_SCREEN')).toBe('local');
    expect(classifyAction('REPLACE')).toBe('system');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsActionClass.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsActionClass.js`:
```javascript
/** Central action classifier (spec §6). Every reducer / applyOmsMutation
 * action is in exactly one class. The offline guard allows `local` and
 * `system`, rejects `scheduling`. JUMP_TO_WEEK / THIS_WEEK are `scheduling`
 * because ensureWeek can create a draft week (a persisted change). */
export const SCHEDULING_MUTATIONS = new Set([
  // applyOmsMutation
  'UPSERT_DEPARTMENT', 'REMOVE_DEPARTMENT', 'UPSERT_ROLE', 'REMOVE_ROLE',
  'UPSERT_RESOURCE_NEED', 'REMOVE_RESOURCE_NEED', 'UPSERT_CONSTRAINT', 'REMOVE_CONSTRAINT',
  'UPSERT_EMPLOYEE', 'REMOVE_EMPLOYEE', 'SET_EMPLOYEE_TITLE',
  'UPSERT_ROLE_PREFERENCE', 'REMOVE_ROLE_PREFERENCE',
  'UPSERT_LOCATION_ELIGIBILITY', 'REMOVE_LOCATION_ELIGIBILITY',
  'UPSERT_ROTATION', 'REMOVE_ROTATION', 'SET_DAY_DEPARTMENT',
  'UPSERT_NEED_OVERRIDE', 'CLEAR_NEED_OVERRIDE',
  // reducer switch — persisted effects
  'SET_DVM_COUNT', 'SET_OVERRIDE', 'CLEAR_OVERRIDES', 'DECIDE_PTO',
  'AUTHORIZE_VIOLATION', 'FINALIZE', 'REVERT_DRAFT', 'PUBLISH', 'ASSIGN_DVM_TEAM',
  'JUMP_TO_WEEK', 'THIS_WEEK',
]);

export const LOCAL_ONLY_ACTIONS = new Set([
  'SET_SCREEN', 'SELECT_WEEK', 'SHIFT_WEEK', 'TOGGLE_AI',
  'SELECT_PTO', 'PREVIEW_PTO', 'CLEAR_PTO_PREVIEW',
]);

export const SYSTEM_ACTIONS = new Set(['REPLACE']);

export function classifyAction(type) {
  if (SCHEDULING_MUTATIONS.has(type)) return 'scheduling';
  if (LOCAL_ONLY_ACTIONS.has(type)) return 'local';
  if (SYSTEM_ACTIONS.has(type)) return 'system';
  throw new Error(`unclassified action: ${type}`);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsActionClass.test.js`
Expected: PASS. If it fails listing an unclassified action, add it to the correct set — do not weaken the completeness test.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsActionClass.js src/state/omsActionClass.test.js
git commit -m "feat(oms): central action classifier with completeness guard"
```

---

