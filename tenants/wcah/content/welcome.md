# WCAH: OMS Hall of Records

> **West Coast Animal Hospital — Operations Management System (OMS)**  
> *Permanent Architectural Archive, Project Genesis, Cross-Generational Timeline, and Technical Retrospective.*

---

> ### 📡 Live Project Feed — [Open the Devlog tenant →](/devlog/)
>
> Ongoing status reports for the active **[oms-new](https://github.com/TomWCAH/oms-new)** repository (OMS v2) are published in the **[Devlog](/devlog/)**: latest changes, CI health, documentation drift, and next-sprint recommendations. Start with the [2026-08-19 repository report (3rd pass)](/devlog/#repo-status-2026-08-19-3).

---

## 🏛️ Executive Welcome

Welcome to the **WCAH OMS Hall of Records**. This portal is the primary anchor of the West Coast Animal Hospital documentation ecosystem. It chronicles the journey of engineering an **AI-native, constraint-driven Operations Management System** to solve one of the most critical operational challenges in modern veterinary medicine: **clinical shift scheduling, skill-matched staffing, and enterprise resource planning**.

Here you will find the original business genesis, foundational specifications, architectural transformation blueprints, a comprehensive multi-repo timeline, and an in-depth retrospective analyzing our **"greenfield next to brownfield"** iterative development strategy.

```mermaid
graph TD
    classDef anchor fill:#516d7d,stroke:#3b525f,stroke-width:2px,color:#fff;
    classDef devlog fill:#b45309,stroke:#92400e,stroke-width:2px,color:#fff;
    classDef v0 fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#fff;
    classDef v1 fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef v2 fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#fff;

    Anchor["🏛️ WCAH Hall of Records (Anchor)"]:::anchor

    Anchor --> Devlog["📡 Tenant: devlog (Live Feed)<br/>• oms-new Status Reports<br/>• CI & Test Health<br/>• Sprint Recommendations"]:::devlog
    Anchor --> V0["📦 Tenant: oms-v0 (Scheduler MVP)<br/>• Local-First JS Engine<br/>• Rule Extraction & Parity<br/>• 22 SDD Task Briefs & Reports"]:::v0
    Anchor --> V1["🚀 Tenant: oms-v1 (Full-Stack OMS)<br/>• FastAPI Backend & SQLite/PG<br/>• Modular Relational Schema<br/>• SP2A Document API & SDD Tasks"]:::v1
    Anchor --> V2["💎 Tenant: oms-v2 (Next-Gen Foundation)<br/>• Clean-Slate Foundation Slice<br/>• Decoupled Skills & Coverage Model<br/>• Deterministic Seed Conversion"]:::v2
```

---

## 🧭 Hall of Records Navigation

### 1. [Genesis & Business Problem](#genesis-and-business-problem)
Explore the origin of the project: the ~60 employee staffing puzzle at WCAH Linda Vista, the single-person bus-factor bottleneck, tacit rules, and why off-the-shelf software failed.

### 2. [Scheduling Epic Specification](#scheduling-epic-spec)
The foundational prototyping brief defining why straight mathematical optimization fails, cross-industry mechanisms stolen from aviation PBS and Wharton Course Match, assumptions challenged, and the 3-layer architecture.

### 3. [12-Factor Production Architecture](#architecture-12factor-plan)
The enterprise transformation roadmap aligning the platform with the 12-Factor App methodology: FastAPI, async SQLAlchemy, PostgreSQL, Redis, Microsoft Entra ID (O365) SSO, and containerization.

### 4. [Evolution Timeline](#evolution-timeline)
A comprehensive chronological timeline from July 2026 through August 2026 mapping every sprint milestone, design decision, and technical pivot across all three repository generations.

### 5. [Approaches & Technology Stack](#approaches-and-technology)
A comparative deep dive into the architectures, programming languages, state managers, persistence layers, and testing frameworks used in each generation.

### 6. [Challenges Met & Lessons Learned](#challenges-and-lessons)
Detailed post-mortems on tacit knowledge extraction, Excel benchmark parity, home department decoupling, frontend/backend schema drift, and robustness-first scheduling.

### 7. [Greenfield vs. Brownfield Iterative Analysis](#greenfield-vs-brownfield-analysis)
An architectural essay examining why each repository iteration was transitioned, proving why "greenfield next to brownfield" served as a dramatic development accelerator rather than wasteful churn.

---

## 🔗 Direct Links to Sub-Tenant Archives

| Tenant Repository | Title & Focus | Documents | Primary Innovations | Link |
| :--- | :--- | :---: | :--- | :---: |
| **`devlog`** | **Live Feed (oms-new)** | **Rolling** | Ongoing status reports for the active `oms-new` repository: latest changes, CI health, doc drift, sprint recommendations. | [Browse `devlog` →](/devlog/) |
| **`oms-v0`** | **Scheduler MVP** | **64 Docs** | Local-first prototype, pure JS domain rules, Excel parity benchmark, 22 SDD task briefs & reports. | [Browse `oms-v0` →](/oms-v0/) |
| **`oms-v1`** | **Full-Stack OMS** | **60 Docs** | Python FastAPI backend, React frontend, modular database schema, conformance testing, SP2A Document API. | [Browse `oms-v1` →](/oms-v1/) |
| **`oms-v2`** | **Next-Gen OMS (`oms-new`)** | **44 Docs** | Greenfield foundation slice, decoupled skill profiles, practice shift lengths, deterministic seed conversion. | [Browse `oms-v2` →](/oms-v2/) |

---

## ⚡ Global Search & Command Palette

Press **⌘K** (or **Ctrl+K**) anywhere to instantly search across all historical records, architectural decisions, and domain models.
