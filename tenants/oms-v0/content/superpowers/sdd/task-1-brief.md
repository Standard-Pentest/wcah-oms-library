### Task 1: Scaffold the app

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `CLAUDE.md`, `src/main.jsx`, `src/index.css`, `src/ui/App.jsx`

**Interfaces:**
- Produces: a running Vite + React + Tailwind v4 app with vitest wired; `src/index.css` defines every design token later tasks use (`primary`, `cream`, `charcoal`, `coast-*`, `glass*`, `.glass-panel`, `.coast-bg`, `.coast-panel`).

- [ ] **Step 1: Write the project files**

`package.json`:

```json
{
  "name": "wcah-scheduler",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.525.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.11",
    "@testing-library/react": "^16.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.1.11",
    "vite": "^6.3.5",
    "vitest": "^4.1.10"
  }
}
```

`vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WCAH Scheduler</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
.DS_Store
```

`src/main.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/index.css` (tokens ported from the prototype, Coastal Glass included):

```css
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap');
@import 'tailwindcss';

@theme {
  --font-sans: 'Open Sans', ui-sans-serif, system-ui, sans-serif;
  --color-primary: #516d7d;
  --color-primary-hover: #6297b5;
  --color-accent: #475a6e;
  --color-cream: #f9f9f7;
  --color-charcoal: #454545;
  --color-success: #d4edda;
  --color-success-text: #155724;
  --color-danger: #b3261e;
  --color-danger-soft: #f8d7da;
  --color-amber-soft: #fff3cd;
  --color-amber-text: #856404;
  /* Coastal Glass — dashboard dark surface */
  --color-coast-deep: #0b1e2d;
  --color-coast-mid: #123f56;
  --color-coast-dark: #0d2b3e;
  --color-coast-accent: #5eead4;
  --color-coast-accent-soft: #99f6e4;

  --color-glass: rgb(255 255 255 / 0.55);
  --color-glass-strong: rgb(255 255 255 / 0.75);
  --color-glass-border: rgb(255 255 255 / 0.45);
}

body {
  @apply bg-cream font-sans text-charcoal antialiased;
}

.glass-panel {
  @apply bg-glass border-glass-border border shadow-sm backdrop-blur-md;
}

.coast-bg {
  background: linear-gradient(
    135deg,
    var(--color-coast-deep) 0%,
    var(--color-coast-mid) 45%,
    var(--color-coast-dark) 100%
  );
}
.coast-panel {
  @apply rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.25);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media print {
  .no-print { display: none !important; }
}
```

`src/ui/App.jsx` (minimal; replaced by the real shell in Task 14):

```jsx
export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-primary">WCAH Scheduler</h1>
      <p className="mt-2 text-sm">Employee scheduling MVP — shell arrives in Task 14.</p>
    </div>
  );
}
```

`CLAUDE.md`:

```markdown
# WCAH Scheduler

Employee shift scheduling MVP for West Coast Animal Hospital Linda Vista.
Automates the office manager's Excel schedule-builder workbook. Spec:
`docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md`.

## Commands

- `npm run dev` — dev server on 5174 (browser preview: launch config `wcah-scheduler`)
- `npx vitest run` — all tests (fast, no browser)
- `npm run build` — production build

## Hard rules

- `src/domain`, `src/data`, `src/import` are pure: no React, no `Date.now()`,
  no id generation. Ids/timestamps arrive via action payloads / factory args.
- React components at module scope only.
- Design tokens live in `src/index.css` `@theme`; components use token
  classes, never raw hex.
- `src/data/parity-aug02.test.js` is the Excel-parity tripwire: it asserts the
  engine reproduces the real workbook's Aug 2–8 week cell-for-cell. Never
  edit fixtures to make it pass — fix the pipeline.
- Seed data in `src/data/` is transcribed from the real workbook. It is
  ground truth, not sample data.
- Ubiquitous language: Roster, Pattern, Rotation, Toggle, Week Setup,
  Time Off, Makeup Shift, Override, Proposed Schedule, Coverage, Gap,
  Violation, Pull Order, Publish.
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` created.

- [ ] **Step 3: Verify the toolchain**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found, exiting with code 0`

Run: `npm run build`
Expected: `✓ built in …` with `dist/` output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + Tailwind v4 app with design tokens"
```

---

