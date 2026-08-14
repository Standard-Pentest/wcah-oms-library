# Login Lock Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single shared-password lock screen in front of the WCAH Scheduler app, gating access on a shared office computer, with no server/accounts involved.

**Architecture:** A small `src/ui/auth.js` module owns the placeholder password and a `localStorage`-backed unlocked flag. `App.jsx` checks that flag before mounting `SchedulerProvider`/`Shell` at all — if locked, it renders a new `LoginScreen` component instead. `Shell` gains a "Lock" button in its header that clears the flag and flips back to the login screen.

**Tech Stack:** React 18, Vite, Tailwind v4 (`@theme` tokens in `src/index.css`), Vitest + Testing Library, `fake-indexeddb` for tests that exercise the real store.

## Global Constraints

- React components at module scope only (per `CLAUDE.md`).
- Use design-token classes (`text-primary`, `bg-danger-soft`, `coast-bg`, `coast-panel`, etc.) from `src/index.css` `@theme` — never raw hex values.
- `src/domain`, `src/data`, `src/import` purity rules do not apply to this work — everything here lives in `src/ui`.
- Test files needing DOM APIs must start with `// @vitest-environment jsdom` (this project's default Vitest environment is `node`; see `src/ui/App.test.jsx` for precedent).
- Tests exercising the real IndexedDB-backed store must `import 'fake-indexeddb/auto'` (see `src/state/persistence.test.js` for precedent).

---

### Task 1: Auth module

**Files:**
- Create: `src/ui/auth.js`
- Test: `src/ui/auth.test.js`

**Interfaces:**
- Produces: `PASSWORD` (string constant, placeholder value `'CHANGE_ME'`), `checkPassword(input: string): boolean`, `isUnlocked(): boolean`, `setUnlocked(): void`, `clearUnlocked(): void`. All read/write a single `localStorage` key `'wcah-scheduler:unlocked'`.

- [ ] **Step 1: Write the failing test**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { PASSWORD, checkPassword, isUnlocked, setUnlocked, clearUnlocked } from './auth.js';

describe('auth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('checkPassword accepts the configured password and rejects anything else', () => {
    expect(checkPassword(PASSWORD)).toBe(true);
    expect(checkPassword('wrong')).toBe(false);
    expect(checkPassword('')).toBe(false);
  });

  it('isUnlocked is false until setUnlocked is called', () => {
    expect(isUnlocked()).toBe(false);
    setUnlocked();
    expect(isUnlocked()).toBe(true);
  });

  it('clearUnlocked reverses setUnlocked', () => {
    setUnlocked();
    clearUnlocked();
    expect(isUnlocked()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/auth.test.js`
Expected: FAIL — `src/ui/auth.js` does not exist yet (import error).

- [ ] **Step 3: Write minimal implementation**

```js
const STORAGE_KEY = 'wcah-scheduler:unlocked';

/** Placeholder — replace with the real shared password before real use. */
export const PASSWORD = 'CHANGE_ME';

export function checkPassword(input) {
  return input === PASSWORD;
}

export function isUnlocked() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setUnlocked() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

export function clearUnlocked() {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/auth.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/auth.js src/ui/auth.test.js
git commit -m "feat(auth): add placeholder-password lock helpers"
```

---

### Task 2: LoginScreen component

**Files:**
- Create: `src/ui/LoginScreen.jsx`
- Test: `src/ui/LoginScreen.test.jsx`

**Interfaces:**
- Consumes: `checkPassword`, `PASSWORD` from `src/ui/auth.js` (Task 1).
- Produces: default export `LoginScreen({ onUnlock: () => void })` — a form; calls `onUnlock()` exactly once when the entered password is correct, otherwise shows an inline error and does not call `onUnlock`.

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginScreen from './LoginScreen.jsx';
import { PASSWORD } from './auth.js';

describe('LoginScreen', () => {
  it('calls onUnlock when the correct password is submitted', () => {
    const onUnlock = vi.fn();
    render(<LoginScreen onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByText('Unlock'));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does not call onUnlock for the wrong password', () => {
    const onUnlock = vi.fn();
    render(<LoginScreen onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Unlock'));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('clears a previous error once the field is edited again', () => {
    const onUnlock = vi.fn();
    render(<LoginScreen onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Unlock'));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/LoginScreen.test.jsx`
Expected: FAIL — `src/ui/LoginScreen.jsx` does not exist yet (import error).

- [ ] **Step 3: Write minimal implementation**

```jsx
import React, { useState } from 'react';
import { checkPassword } from './auth.js';

export default function LoginScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (checkPassword(password)) {
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="coast-bg flex min-h-screen items-center justify-center p-6 text-white">
      <form onSubmit={handleSubmit} className="coast-panel w-full max-w-sm p-6">
        <h1 className="text-lg font-bold text-coast-accent">WCAH Scheduler</h1>
        <p className="mt-1 text-sm text-white/70">Enter the password to continue.</p>
        <label
          htmlFor="login-password"
          className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-white/60"
        >
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          autoFocus
          className="mt-1 w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        {error && (
          <p role="alert" className="mt-2 rounded bg-danger-soft px-2 py-1 text-sm text-danger">
            Incorrect password.
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/LoginScreen.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/LoginScreen.jsx src/ui/LoginScreen.test.jsx
git commit -m "feat(auth): add LoginScreen component"
```

---

### Task 3: Wire the lock screen into App

**Files:**
- Modify: `src/ui/App.jsx:1-89` (full file shown below in context)
- Modify: `src/ui/App.test.jsx` (add a new describe block; existing `Shell`-direct test is unchanged)

**Interfaces:**
- Consumes: `LoginScreen` (Task 2, prop `onUnlock`), `isUnlocked`/`setUnlocked`/`clearUnlocked` from `src/ui/auth.js` (Task 1).
- Produces: `Shell` now accepts an optional `onLock: () => void` prop and renders a "Lock" button in its header that calls it. Default export `App` renders `LoginScreen` when locked, otherwise `SchedulerProvider` + `Shell` as before.

Current `src/ui/App.jsx` in full (for exact line reference):

```jsx
import React from 'react';
import { SchedulerProvider, useScheduler } from '../state/SchedulerContext.jsx';
import { createIdbStore } from '../state/persistence.js';
import { seedState } from '../state/store.js';
import WeekBoard from './WeekBoard.jsx';
import Dashboard from './Dashboard.jsx';
import ImportScreen from './ImportScreen.jsx';
import RosterScreen from './RosterScreen.jsx';
import PublishScreen from './PublishScreen.jsx';

const appStore = createIdbStore();

/** Screen registry — later tasks replace/extend entries. */
const SCREENS = [
  { key: 'dashboard', label: 'Dashboard', Component: Dashboard },
  { key: 'board', label: 'Week Board', Component: WeekBoard },
  { key: 'import', label: 'Time Off', Component: ImportScreen },
  { key: 'roster', label: 'Roster', Component: RosterScreen },
  { key: 'publish', label: 'Publish', Component: PublishScreen },
];

const BANNER = {
  'version-mismatch':
    'Saved data is from an incompatible version — running from seed, and nothing is being saved so your saved copy stays intact. Export JSON to keep this session, or import a backup.',
  error:
    'Saved data could not be read — running from seed, and nothing is being saved so your saved copy stays intact. Export JSON to keep this session, or import a backup.',
  'save-error':
    'The last save failed — recent changes may NOT survive a reload. Export JSON to back up.',
};

function StorageBanner() {
  const { storeStatus, writesEnabled, dispatch } = useScheduler();
  if (storeStatus === 'ok' || storeStatus === 'loading') return null;
  const discard = () => {
    if (window.confirm('Discard the saved data and start fresh? The saved copy will be OVERWRITTEN and cannot be recovered — export a JSON backup first if you want it.')) {
      dispatch({ type: 'REPLACE_STATE', state: seedState() });
    }
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-3 bg-danger-soft px-4 py-2 text-sm text-danger">
      <span>{BANNER[storeStatus] ?? BANNER.error}</span>
      {!writesEnabled && (
        <button type="button" onClick={discard}
          className="rounded border border-danger/40 px-2 py-0.5 text-xs font-semibold hover:bg-danger/10">
          Discard saved data and start fresh
        </button>
      )}
    </div>
  );
}

export function Shell() {
  const { state, dispatch } = useScheduler();
  const Active = (SCREENS.find((s) => s.key === state.ui.screen) ?? SCREENS[0]).Component;
  return (
    <div className="min-h-screen">
      <StorageBanner />
      <header className="no-print flex items-center gap-6 border-b border-charcoal/10 bg-glass-strong px-6 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold text-primary">WCAH Scheduler</h1>
        <nav className="flex gap-1">
          {SCREENS.map((s) => (
            <button
              key={s.key} type="button"
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: s.key })}
              className={
                state.ui.screen === s.key
                  ? 'rounded bg-primary px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded px-3 py-1.5 text-sm text-charcoal/70 hover:bg-primary/10'
              }
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Active />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SchedulerProvider store={appStore}>
      <Shell />
    </SchedulerProvider>
  );
}
```

- [ ] **Step 1: Write the failing tests**

Add this describe block to the bottom of `src/ui/App.test.jsx` (keep the existing `import` list, `describe('app shell', ...)` block, and its test unchanged — just add the new imports and block below them):

```jsx
// add to the existing import list at the top of App.test.jsx:
import 'fake-indexeddb/auto';
import App from './App.jsx';
import { PASSWORD } from './auth.js';

// ...existing `describe('app shell', ...)` block stays as-is...

describe('app lock screen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the login screen when locked', () => {
    render(<App />);
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('unlocks and shows the shell after the correct password', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByText('Unlock'));
    expect(await screen.findByText('Dashboard')).toBeTruthy();
  });

  it('re-locks and shows the login screen again after clicking Lock', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('Dashboard');
    fireEvent.click(screen.getByText('Lock'));
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
```

`beforeEach`/`fireEvent` must be added to the existing `vitest`/`@testing-library/react` imports at the top of the file alongside what's already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/App.test.jsx`
Expected: FAIL — `App.jsx` has no default-exported lock gating yet, `LoginScreen`/`auth.js` imports resolve but `App` always renders `Shell` directly; `getByLabelText('Password')` will not find anything, and the "Lock" button doesn't exist.

- [ ] **Step 3: Write the implementation**

Modify `src/ui/App.jsx`:

Add imports (after the existing `PublishScreen` import):

```jsx
import LoginScreen from './LoginScreen.jsx';
import { isUnlocked, setUnlocked, clearUnlocked } from './auth.js';
```

Add `useState` to the React import:

```jsx
import React, { useState } from 'react';
```

Change the `Shell` function signature and header to accept `onLock` and render the Lock button:

```jsx
export function Shell({ onLock }) {
  const { state, dispatch } = useScheduler();
  const Active = (SCREENS.find((s) => s.key === state.ui.screen) ?? SCREENS[0]).Component;
  return (
    <div className="min-h-screen">
      <StorageBanner />
      <header className="no-print flex items-center gap-6 border-b border-charcoal/10 bg-glass-strong px-6 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold text-primary">WCAH Scheduler</h1>
        <nav className="flex gap-1">
          {SCREENS.map((s) => (
            <button
              key={s.key} type="button"
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: s.key })}
              className={
                state.ui.screen === s.key
                  ? 'rounded bg-primary px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded px-3 py-1.5 text-sm text-charcoal/70 hover:bg-primary/10'
              }
            >
              {s.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onLock}
          className="ml-auto rounded px-3 py-1.5 text-sm text-charcoal/70 hover:bg-primary/10"
        >
          Lock
        </button>
      </header>
      <main>
        <Active />
      </main>
    </div>
  );
}
```

Replace the default export:

```jsx
export default function App() {
  const [unlocked, setUnlockedState] = useState(isUnlocked);

  if (!unlocked) {
    return (
      <LoginScreen
        onUnlock={() => {
          setUnlocked();
          setUnlockedState(true);
        }}
      />
    );
  }

  return (
    <SchedulerProvider store={appStore}>
      <Shell
        onLock={() => {
          clearUnlocked();
          setUnlockedState(false);
        }}
      />
    </SchedulerProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/App.test.jsx`
Expected: PASS (4 tests: the original `app shell` test plus the 3 new `app lock screen` tests)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all existing tests (including `parity-aug02.test.js`) plus the new ones from Tasks 1–3.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.jsx src/ui/App.test.jsx
git commit -m "feat(auth): gate the app behind a lock screen"
```

---

## Manual verification (after Task 3)

- [ ] Run `npm run dev`, open the app: confirm the lock screen shows instead of the dashboard.
- [ ] Enter an incorrect password: confirm the inline error appears and the app stays locked.
- [ ] Enter `CHANGE_ME`: confirm the app unlocks and the dashboard/header appear.
- [ ] Reload the page: confirm it stays unlocked (no login screen again).
- [ ] Click "Lock" in the header: confirm the login screen reappears, and reloading still shows the login screen (state persisted as locked).
