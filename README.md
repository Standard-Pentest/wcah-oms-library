# 🏛️ West Coast Animal Hospital — OMS Documentation Library

> Multi-tenant architectural archive, specifications, cross-generational timeline, and technical retrospective for the **West Coast Animal Hospital (WCAH) Operations Management System (OMS)**.

---

## 📖 Overview

This repository houses the complete documentation ecosystem for the WCAH OMS platform across its architectural evolution. Powered by the [Pagenary](https://github.com/jmagly/pagenary) multi-tenant documentation generator, it unifies **179 archived documentation pages** plus a rolling devlog feed across five distinct tenant portals with search, navigation, and [West Coast Animal Hospital](https://www.westcoast.vet/) branding.

### 🧭 Tenant Archives

| Tenant ID | Title | Scope & Innovations | Document Count |
| :--- | :--- | :--- | :---: |
| **`wcah`** | **🏛️ WCAH: OMS Hall of Records** | **Anchor Portal**: Business genesis, clinical staffing problem, Scheduling Epic brief, 12-factor cloud blueprints, full chronological timeline, and "greenfield next to brownfield" iterative analysis. | **11 Pages** |
| **`devlog`** | **📡 WCAH Devlog (oms-new Status)** | **Live Feed**: Rolling status reports for the active [`oms-new`](https://github.com/TomWCAH/oms-new) repository — latest changes, CI health, doc drift, and sprint recommendations. Reports are dropped into `dropload/` and published here. | **Rolling** |
| **`oms-v0`** | **📦 OMS v0 (Scheduler MVP)** | **Generation 1**: Local-first prototype, pure JavaScript rule engine, 100% Excel benchmark parity tests, and 22 SDD task briefs & reports. | **64 Pages** |
| **`oms-v1`** | **🚀 OMS v1 (Full-Stack OMS)** | **Generation 2**: Python FastAPI backend, SQLite/PostgreSQL, modular relational schema, conformance test contracts, and SP2A Document API sprint reports. | **60 Pages** |
| **`oms-v2`** | **💎 OMS v2 (Next-Gen Foundation)** | **Generation 3 (`oms-new`)**: Greenfield Foundation Slice, decoupled clinical skill profiles, dynamic shift length models, and deterministic seed conversion pipelines. | **44 Pages** |

---

## 🛠️ Prerequisites

- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **Git**

Verify your environment:
```bash
node -v
npm -v
git --version
```

---

## 🚀 Getting Started

### 🍏 macOS & 🐧 Linux

1. **Clone the repository**:
   ```bash
   git clone https://github.com/HinchK/wcah-docs-library.git
   cd wcah-docs-library
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build & Start (One-Command Runner)**:
   ```bash
   ./portal.sh
   ```
   *Alternatively, using npm:*
   ```bash
   npm run build
   npm run serve
   ```

4. **Open in your browser**:
   - **Root Portal Hub**: [http://localhost:5173/](http://localhost:5173/)
   - **WCAH Hall of Records**: [http://localhost:5173/wcah/](http://localhost:5173/wcah/)
   - **Devlog (oms-new Status)**: [http://localhost:5173/devlog/](http://localhost:5173/devlog/)
   - **OMS v0 Archive**: [http://localhost:5173/oms-v0/](http://localhost:5173/oms-v0/)
   - **OMS v1 Archive**: [http://localhost:5173/oms-v1/](http://localhost:5173/oms-v1/)
   - **OMS v2 Archive**: [http://localhost:5173/oms-v2/](http://localhost:5173/oms-v2/)

---

### 🪟 Windows

#### Using PowerShell:

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/HinchK/wcah-docs-library.git
   cd wcah-docs-library
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Build & Start (PowerShell Runner)**:
   ```powershell
   .\portal.ps1
   ```
   *Or using standard npm commands:*
   ```powershell
   npm run build
   npm run serve
   ```

4. **Open in your browser**: Navigate to [http://localhost:5173](http://localhost:5173).

#### Using Command Prompt (CMD):

```cmd
git clone https://github.com/HinchK/wcah-docs-library.git
cd wcah-docs-library
npm install
npm run build
npm run serve
```

---

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run build` | Builds all 5 tenants and generates the root portal hub at `dist/library/index.html`. |
| `npm run dev` / `npm run portal` | Full build followed immediately by the local preview server. |
| `npm run serve` / `npm start` | Starts the Pagenary local preview server on `http://localhost:5173`. |
| `npm run lint` | Runs accessibility, link validation, and manifest schema checks. |
| `npm run clean` | Cleans the output build cache and `dist/` directory. |
| `npm run build:wcah` | Builds only the `wcah` anchor tenant. |
| `npm run build:devlog` | Builds only the `devlog` live-feed tenant. |
| `npm run build:v0` | Builds only the `oms-v0` sub-tenant. |
| `npm run build:v1` | Builds only the `oms-v1` sub-tenant. |
| `npm run build:v2` | Builds only the `oms-v2` sub-tenant. |

---

## 📂 Repository Structure

```text
wcah-docs-library/
├── package.json               # Scripts & @pagenary/publisher dependency
├── tenants.json               # Multi-tenant registry
├── portal.sh                  # macOS/Linux one-step build & serve script
├── portal.ps1                 # Windows PowerShell one-step runner
├── dropload/                  # Devlog report intake inbox (see dropload/README.md)
├── scripts/
│   └── build-portal.js        # Root portal hub builder (dist/library/index.html)
├── tenants/
│   ├── wcah/                  # Anchor Portal: Hall of Records
│   │   ├── config.json        # WCAH theme & branding config
│   │   ├── manifest.json      # Curated chapters navigation
│   │   └── content/           # Markdown specs, timeline, retrospective
│   ├── devlog/                # Live Feed: oms-new status reports
│   │   ├── config.json        # Devlog theme & branding config
│   │   ├── manifest.json      # Newest-first report navigation
│   │   └── content/           # Published repo-status reports
│   ├── oms-v0/                # Sub-Tenant: Generation 1 (Scheduler MVP)
│   │   ├── config.json
│   │   ├── manifest.json
│   │   └── content/           # 64 docs: specs, plans, SDD reports
│   ├── oms-v1/                # Sub-Tenant: Generation 2 (Full-Stack OMS)
│   │   ├── config.json
│   │   ├── manifest.json
│   │   └── content/           # 60 docs: API contracts, DB schema, SP2A
│   └── oms-v2/                # Sub-Tenant: Generation 3 (Next-Gen Foundation)
│       ├── config.json
│       ├── manifest.json
│       └── content/           # 44 docs: foundation slice, seed conversion
└── dist/                      # Compiled static sites (generated by build)
```

---

## 🎨 Visual Identity & Theming

- **`wcah` (Anchor Portal · Hall of Records)**: Adheres to the official [West Coast Animal Hospital](https://www.westcoast.vet/) brand identity:
  - **Primary Brand Slate**: `#516d7d`
  - **Interactive Ocean Blue**: `#6297b5`
  - **Ivory Header Surface**: `#f9f9f7`
  - **Primary Typography**: `Open Sans`
- **Sub-Tenant Developer Themes**:
  - **`devlog`**: `#b45309` (Amber — live oms-new status feed)
  - **`oms-v0`**: `#0d9488` (Teal)
  - **`oms-v1`**: `#2563eb` (Blue)
  - **`oms-v2`**: `#7c3aed` (Purple)

---

## 📄 License

Internal Documentation Library — Proprietary to West Coast Animal Hospital. All rights reserved.
