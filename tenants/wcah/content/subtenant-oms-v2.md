# Sub-Tenant: OMS v2 (Next-Gen Foundation)

> **Active Status**: *Production Baseline · Greenfield Clean Foundation · 44 Documents*  
> **Source Repository**: [`/Users/hinchk/WestCoast.Vet/oms-new`](file:///Users/hinchk/WestCoast.Vet/oms-new)  
> **Dedicated Documentation Portal**: **[Open OMS v2 Documentation Portal ↗](/oms-v2/)**

---

## 🎯 Repository Overview

`oms-v2` (`oms-new`) represents the third and active generation of the WCAH Operations Management System. Built from a clean slate to eliminate transitional technical debt, it implements the **Foundation Slice architecture** using **Pydantic v2**, **strict TypeScript client bindings**, and **decoupled clinical capability profiles**.

---

## 🔑 Key Innovations & Contributions

1. **Greenfield Foundation Slice**: Zero-debt, highly modular architecture with explicit domain boundaries, strict data validation, and clean separation between business logic and database drivers.
2. **Coverage Needs Model**: Hour-by-hour staffing demand algorithms anchored directly to clinical appointment curves and surgery schedules.
3. **Practice Default Shift Lengths**: Formal standardization of clinical shift spans (8h, 9h, 10h, 12h) across hospital roles.
4. **Deterministic Seed Data Pipeline**: Automated, idempotent conversion tools transforming master hospital workbooks into validated database fixtures.
5. **Strict 12-Factor Compliance**: Native environment configuration, containerization, structured logging, and migration isolation.

---

## 📚 Archive Contents (44 Documents)

* **Architecture & Standards**: Repository README, Documentation Index, Domain Model, Track D Rulings, TOM Review.
* **Open Design Items**: Coverage Needs Model, Practice Default Shift Lengths.
* **Specifications**: Foundation Slice Design (Aug 11), Document API, Modular DB Schema, Excel Export/Import, Seed Workbook.
* **Implementation Plans**: Foundation Slice Plan, Document API Plan, Seed Workbook Plan, Stabilization Plan.
* **Seed Data Conversion**: Conversion Rules, Source Workbook Guides, and Test Fixtures.

---

<div style="margin-top: 2rem; padding: 1.5rem; background: rgba(124, 58, 237, 0.1); border: 1px solid #7c3aed; border-radius: 0.75rem; text-align: center;">
  <h3 style="margin-bottom: 0.5rem; color: #7c3aed;">Explore the Dedicated oms-v2 Portal</h3>
  <p style="margin-bottom: 1rem; color: #64748b;">Browse all 44 foundation specifications, open design items, and seed conversion dictionaries.</p>
  <a href="/oms-v2/" style="display: inline-block; padding: 0.75rem 1.75rem; background: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 700; border-radius: 0.5rem;">Launch OMS v2 Portal →</a>
</div>
