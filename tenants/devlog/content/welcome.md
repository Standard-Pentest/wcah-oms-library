# WCAH Devlog — oms-new Status Reports

> **West Coast Animal Hospital — Operations Management System (OMS)**  
> *Rolling status feed for the active development repository.*  
> **Source repository:** [github.com/TomWCAH/oms-new](https://github.com/TomWCAH/oms-new) (OMS v2, Generation 3)

---

## 📡 What This Tenant Is

The **devlog** is the live project feed for the [oms-new](https://github.com/TomWCAH/oms-new) repository. While the [Hall of Records](/wcah/) and the generational archives (`oms-v0`, `oms-v1`, `oms-v2`) preserve the *specifications and history* of the WCAH OMS platform, this tenant tracks *what is happening right now* on the active codebase.

Each report is a point-in-time snapshot covering:

- **Latest changes** — recent commits, slices shipped, and their migration-relevant consequences.
- **CI and test health** — pipeline status, failing checks, and coverage gaps.
- **Documentation drift** — places where `README.md`, `HANDOFF.md`, or other prose contradicts committed reality.
- **Next sprint suggestions** — prioritized, effort-estimated recommendations.

---

## 📥 How Reports Are Published

New reports arrive as markdown files dropped into the `dropload/` folder of the docs-library repository, named with the reporting date:

```text
dropload/repo-status-YYYY-MM-DD.md
```

Publishing a report means copying it into `tenants/devlog/content/` and registering it at the top of the **Status Reports** section in `tenants/devlog/manifest.json`. Reports are listed newest-first and are never rewritten after publication — corrections land in a later report.

---

## 📋 Current Report Index

| Date | Report | Headline |
| :--- | :--- | :--- |
| **2026-08-19** | [Repository Analysis](#repo-status-2026-08-19) | 🔍 Deep-dive through PR #11 (`4a053ce`, 94 commits; supersedes the first 08-18 pass). ✅ All gates green: 331/331 pytest, 92/92 vitest, `ruff` clean. **Week Setup #4a shipped** (DRAFT weeks, fill/replace, explicit save); next slice #4b Week Board; scheduling engine #5 still unbuilt. |
| **2026-08-18 (3rd pass)** | [Repository Analysis](#repo-status-2026-08-18-3) | 🔍 Deep-dive across PRs #1–#10 through `d9a2ca2`. Priority: **need-override pinning bug** in Week Setup silently freezes the unedited field against future Configuration changes. Recommends fix-forward, then #4b Week Board. |
| **2026-08-18 (2nd pass)** | [Repository Analysis](#repo-status-2026-08-18-2) | 🔍 Deep-dive across all 80 commits through `c656009`. Top process risk: **unprotected `main`** caused the ~30-hour red run. Recommends starting sub-project 4 (week lifecycle & board). |
| **2026-08-18** | [Repository Update](#repo-status-2026-08-18) | ✅ `main` is green at `c656009` — PRs #1–#4 merged (writes slice, CI/bootstrap hardening, docs catch-up). Watch item: `sys.path` workaround in `codes.py`. |
| **2026-08-17** | [Repository Status](#repo-status-2026-08-17) | ⛔ `main` is red on 5 lint errors; the configuration-and-roster-writes slice shipped but its ~45 backend tests have never run in CI. |
