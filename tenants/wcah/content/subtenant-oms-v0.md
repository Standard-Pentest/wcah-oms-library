# Sub-Tenant: OMS v0 (Scheduler MVP)

> **Historical Status**: *Archived Reference · Algorithmic Benchmark Oracle · 64 Documents*  
> **Source Repository**: [`/Users/hinchk/WestCoast.Vet/scheduler`](file:///Users/hinchk/WestCoast.Vet/scheduler)  
> **Dedicated Documentation Portal**: **[Open OMS v0 Documentation Portal ↗](/oms-v0/)**

---

## 🎯 Repository Overview

`oms-v0` represents the first generation of the West Coast Animal Hospital scheduling platform. Built as a high-velocity, local-first single-page application using **Vite, React, and IndexedDB**, its primary objective was **tacit knowledge extraction**—capturing the scheduler's intuitive mental rules into an inspectable, deterministic algorithmic engine.

---

## 🔑 Key Innovations & Contributions

1. **The Pure JavaScript Rule Engine**: Implemented 10+ core clinical constraint templates in `src/domain/` (DVM:VA coverage ratios, maximum daily hours, weekly overtime thresholds, and weekend rotation fairness).
2. **100% Excel Parity Ground Truth**: Validated against historical August 2026 hospital spreadsheets cell-by-cell (`parity-aug02.test.js`), proving algorithmic correctness before writing server code.
3. **Clinical Lock Screen & Multi-Role Auth**: Built clinical PIN-lock and terminal switching for fast desktop handoffs between doctors and technicians.
4. **22-Task Spec-Driven Development (SDD)**: Documented complete historical records of every task brief and execution report from the initial build.

---

## 📚 Archive Contents (64 Documents)

* **Specifications**: Scheduler MVP Design, Login & Lock Screen, UI Mockups, Taxonomy & Workflow, Approach B Schema, Production Migration.
* **Implementation Plans**: Scheduler MVP, Login/Lock Screen, Configuration Team, Taxonomy Workflow, Schema Approach B.
* **SDD Execution Reports**: Progress Tracker, Final Fix Report, and Tasks 1 through 22 Briefs & Reports.

---

<div style="margin-top: 2rem; padding: 1.5rem; background: rgba(99, 147, 159, 0.1); border: 1px solid #63939f; border-radius: 0.75rem; text-align: center;">
  <h3 style="margin-bottom: 0.5rem; color: #4f818d;">Explore the Dedicated oms-v0 Portal</h3>
  <p style="margin-bottom: 1rem; color: #516d7d;">Browse all 64 original specifications, implementation plans, and SDD task verification reports.</p>
  <a href="/oms-v0/" style="display: inline-block; padding: 0.75rem 1.75rem; background: #4f818d; color: #ffffff; text-decoration: none; font-weight: 700; border-radius: 0.5rem;">Launch OMS v0 Portal →</a>
</div>
