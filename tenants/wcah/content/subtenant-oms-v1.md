# Sub-Tenant: OMS v1 (Full-Stack OMS)

> **Historical Status**: *Transitional Architecture · Multi-User Backend Oracle · 60 Documents*  
> **Source Repository**: [`/Users/hinchk/WestCoast.Vet/oms`](file:///Users/hinchk/WestCoast.Vet/oms)  
> **Dedicated Documentation Portal**: **[Open OMS v1 Documentation Portal ↗](/oms-v1/)**

---

## 🎯 Repository Overview

`oms-v1` represents the second generation of the WCAH platform. It evolved the local-first prototype into a true client-server application powered by **Python 3.12+ (FastAPI)**, **SQLAlchemy 2.0 Async**, **SQLite/PostgreSQL**, and a Vite React frontend.

---

## 🔑 Key Innovations & Contributions

1. **Enterprise FastAPI Backend**: Built asynchronous RESTful API endpoints for schedule management, roster queries, and rule evaluations.
2. **Modular Relational Schema**: Designed relational tables with foreign-key constraints across identity, roster, weekly shifts, and time-off requests.
3. **Domain Breakthrough (Drop Home Dept)**: Discovered that rigid home departments broke clinical flexibility, leading to the Track D ruling to decouple staff from fixed departmental silos.
4. **SP2A Document Export & Import API**: Designed and implemented openpyxl Excel serializers and JSON ingestion pipelines across a 10-task SDD sprint.
5. **Conformance Test Harness**: Established strict frontend/backend contract validation (`conformance/contract.md`).

---

## 📚 Archive Contents (60 Documents)

* **Architecture & Governance**: OMS Domain Model, Conformance Contract, Track D Rulings, TOM Week Review & SP2 Kickoff.
* **Specifications**: SP2A Document API, Modular DB Schema (Aug 5 & Aug 7), Document Export/Import, Seed Workbook, Non-Standard Shifts, SP0/SP1 Stabilization.
* **Implementation Plans**: Document API, Export/Import, Seed Workbook, Drop Home Dept, Stabilization, and earlier sprint plans.
* **SDD SP2A Reports**: Progress Tracker, Final Fix Report, and Tasks 1 through 10 Briefs & Reports.

---

<div style="margin-top: 2rem; padding: 1.5rem; background: rgba(71, 90, 110, 0.1); border: 1px solid #475a6e; border-radius: 0.75rem; text-align: center;">
  <h3 style="margin-bottom: 0.5rem; color: #475a6e;">Explore the Dedicated oms-v1 Portal</h3>
  <p style="margin-bottom: 1rem; color: #516d7d;">Browse all 60 specifications, API contracts, domain models, and SP2A SDD task reports.</p>
  <a href="/oms-v1/" style="display: inline-block; padding: 0.75rem 1.75rem; background: #475a6e; color: #ffffff; text-decoration: none; font-weight: 700; border-radius: 0.5rem;">Launch OMS v1 Portal →</a>
</div>
