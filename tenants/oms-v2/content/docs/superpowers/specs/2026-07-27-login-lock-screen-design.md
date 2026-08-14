# Login Lock Screen — Design

*Design spec, brainstormed and approved 2026-07-27.*

## What this is

A casual local lock screen in front of the WCAH Scheduler app. The MVP spec
(`2026-07-24-wcah-scheduler-mvp-design.md`, decision log #2 and §1) explicitly
deferred real auth — no server, no accounts — and called out that the
prototype's demo auth/lock screen was intentionally left behind. This is not
that. This is a single shared password gate so the app isn't wide open on a
shared office computer. It provides no real security (the password lives in
client source, visible in devtools) — it is friction against a casual
passerby, nothing more.

## Behavior

- On load, if not unlocked, show `LoginScreen` instead of the app `Shell`.
- `LoginScreen`: centered card, password input + "Unlock" button, styled with
  the existing Coastal Glass tokens (`.glass-panel`, `--color-coast-*`) to
  match the Dashboard's visual language.
- Wrong password: inline error message, input stays, no attempt limiting or
  lockout (YAGNI for a basic gate).
- Correct password: app unlocks and stays unlocked across reloads/browser
  restarts (persisted via `localStorage`), until explicitly locked again.
- Header gets a "Lock" button (next to nav) that re-locks immediately.

## Components

- **`src/ui/auth.js`** — holds the shared password constant (placeholder
  value, to be changed later by the user) and localStorage helpers:
  `isUnlocked()`, `setUnlocked()`, `clearUnlocked()`. Lives in `src/ui`, not
  `src/domain`/`src/data`/`src/import`, so the project's pure-module hard
  rules don't apply; it uses `localStorage` directly, consistent with the
  existing `persistence.js` precedent of browser-API access at this layer.
- **`src/ui/LoginScreen.jsx`** — presentational component. Props: `onUnlock`
  callback. Internal `useState` for the password field and error text. Calls
  `onUnlock()` only after comparing input to the password constant.
- **`src/ui/App.jsx`** — `App` gains local `useState` for `unlocked`,
  initialized from `auth.isUnlocked()`. Renders `LoginScreen` when locked,
  `Shell` when unlocked. `Shell`'s header gets a "Lock" button that calls
  `auth.clearUnlocked()` and flips the parent's `unlocked` state back to
  false (passed down via a prop or context — simplest is a prop threaded from
  `App` into `Shell`).

## State ownership

Auth/unlock state is **not** part of `SchedulerContext`/the reducer — it is
UI-level, not domain data, and needs no undo/import-export/parity guarantees.
It is plain React state in `App`, mirrored to `localStorage`.

## Testing

- `LoginScreen.test.jsx`: wrong password shows an error and does not call
  `onUnlock`; correct password calls `onUnlock` exactly once.
- `App.test.jsx`: extend/add a case covering the locked → unlocked flow
  (renders `LoginScreen` when not unlocked; entering the correct password
  reveals the existing `Shell` content).

## Out of scope

Real authentication, multiple users/accounts, hashing, attempt limiting,
password reset/recovery UI, a backend of any kind. All of this remains
deferred per the MVP spec's decision log.
