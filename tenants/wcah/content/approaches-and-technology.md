# Architectural Approaches & Technology Stack Comparison

> *A detailed technical evaluation of the architectural patterns, frameworks, and storage strategies across all three generations of the WCAH OMS platform.*

---

## 📊 Cross-Generational Comparison Matrix

| Architectural Layer | Generation 1: `oms-v0` (Scheduler) | Generation 2: `oms-v1` (Full Stack) | Generation 3: `oms-v2` (OMS Next-Gen) |
| :--- | :--- | :--- | :--- |
| **Primary Architecture** | Local-First Single-Page Application | Client-Server Monolith (FastAPI + React) | Modular Clean-Architecture Domain Engine |
| **Backend Runtime** | None (In-Browser Execution) | Python 3.12+ (FastAPI + Uvicorn) | Python 3.12+ (FastAPI + Pydantic v2) |
| **Frontend Runtime** | React (JavaScript / JSX) | React (JavaScript / JSX + Vite) | React + TypeScript (Vite + TanStack Query) |
| **Persistence Layer** | IndexedDB (`SchedulerStore`) + JSON | SQLite (Dev) / PostgreSQL (Prod) via SQLAlchemy Async | PostgreSQL with Alembic Migrations |
| **Domain Logic** | Pure JavaScript modules in `src/domain/` | Hybrid (Python API + Legacy JS Engine) | Pure Python domain services with strict typing |
| **API Contract** | Local Function Calls | RESTful JSON Endpoints + Conformance Tests | OpenAPI 3.1 Auto-Generated Client Bindings |
| **State Management** | React Context + IndexedDB event bus | React Local State + Server Fetching | TanStack Query (React Query) Server Cache |
| **Document Processing**| Client-side JSON Import/Export | Server-side openpyxl XLSX Serialization | Deterministic Conversion Pipeline |
| **Testing Strategy** | Vitest Excel Cell Parity Suite | Pytest API Suite + Vitest Conformance Suite | Pytest Domain Suite + Fixture Validation |
| **Documentation** | Local Markdown Files | Markdown Docs + OpenAPI Docs | Pagenary Multi-Tenant Knowledge Base |

---

## 🛠️ Deep Dive: Generation by Generation

### 1. Generation 1 (`oms-v0`): Rapid Prototyping & Rule Extraction
* **Goal**: Prove that human scheduling judgment could be converted into code before building server infrastructure.
* **Technology**:
  - **Vite & React**: Provided instantaneous HMR and component rendering.
  - **@dnd-kit**: Drag-and-drop primitives for clinical timeline manipulation.
  - **IndexedDB**: Zero-latency offline client storage without requiring local database daemons.
  - **Pure JS Rule Solvers**: 10+ rule evaluation functions measuring overtime, coverage deficits, and weekend fairness.
* **Strengths**: Maximum speed of iteration; allowed testing directly against real clinical rosters within 48 hours of project kickoff.
* **Limitations**: Lacked multi-user synchronization; could not enforce relational ACID constraints; difficult to integrate with Paylocity and PIMS APIs.

---

### 2. Generation 2 (`oms-v1`): Enterprise Backend & Conformance
* **Goal**: Establish a scalable REST API and relational schema while preserving frontend prototype workflows.
* **Technology**:
  - **FastAPI**: Asynchronous Python API framework providing high throughput, automatic OpenAPI documentation, and native dependency injection.
  - **SQLAlchemy 2.0 (Async)**: Modern async ORM handling relational mapping and connection pooling.
  - **openpyxl**: Server-side Excel parsing to ingest complex multi-tab clinical workbooks.
  - **Conformance Test Harness**: Custom test suite ensuring requests and responses matched between Python and React.
* **Strengths**: Created a true multi-user backend with persistent relational storage; enabled robust Document API exports.
* **Limitations**: Frontend and backend schema definitions occasionally drifted during rapid prototyping; accumulated transitional adapter code to bridge early Excel quirks.

---

### 3. Generation 3 (`oms-v2`): Clean-Slate Foundation & Decoupled Domain
* **Goal**: Eliminate technical debt, strictly enforce 12-Factor architectural standards, and implement decoupled clinical capabilities.
* **Technology**:
  - **Pydantic v2**: High-speed Rust-backed data validation and schema enforcement.
  - **Foundation Slice Architecture**: Highly modular package structure where domain logic is isolated from database drivers and HTTP transports.
  - **Decoupled Skill & Coverage Model**: Shift assignment based on capability tags (`surgery_certified`, `anesthesia_lead`, `triage_ready`) rather than rigid organizational departments.
  - **Deterministic Seed Pipelines**: Idempotent data conversion utilities transforming clinic spreadsheets into validated database seeds.
* **Strengths**: Zero technical debt; pristine type safety; rock-solid domain invariants; effortless scaling.

---

## 📖 The Role of Pagenary in the WCAH Ecosystem

To prevent documentation decay across multiple repositories, WCAH dogfooded **[Pagenary](https://docs.pagenary.com/)** as the unified documentation platform.

Pagenary provides:
1. **Multi-Tenant Isolation**: Dedicated documentation portals for `oms-v0`, `oms-v1`, `oms-v2`, and `wcah` from a single build pipeline.
2. **Ranked Fortémi Search**: Instant `⌘K` command-palette search indexing every design document, plan, and SDD task.
3. **Docs-as-Code Workflow**: Markdown files live directly in revision control and are built into crawlable static HTML snapshots with zero runtime database dependencies.
