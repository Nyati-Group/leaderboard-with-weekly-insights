# Construction Site Leadership Dashboard
## Master Architecture & Technical Specifications

**Version:** 1.0  
**Status:** Approved Phase 0 Specification  
**Architecture:** Modular Monolith (FastAPI + React/TypeScript + PostgreSQL + Redis)  

---

## 1. Domain Organization (Modular Monolith)

The application maintains strict boundaries across 11 discrete business domains:

1. **Identity & Authorization (`app.models.auth`, `app.api.v1.auth`)**:
   - Multi-tenant site isolation, 3-tier role enforcement, JWT access & refresh tokens.
2. **Site Portfolio & Baselines (`app.models.sites`, `app.api.v1.sites`)**:
   - Master data for 5 initial sites (`CS-PUN-01`, `CS-MUM-02`, `CS-NAS-03`, `CS-REM-04`, `CS-NAG-05`), approved project baselines, milestone sequences, difficulty assessments.
3. **Daily Field Operations (`app.models.operations`, `app.api.v1.daily_reports`)**:
   - Daily construction progress, workforce attendance, machinery, daily expenditure, immutable version history.
4. **Quality Management (`app.models.quality`, `app.api.v1.quality`)**:
   - Inspections, checklists, defect logs, Non-Conformance Reports (NCRs), rework cost/delay tracking.
5. **Safety Management (`app.models.safety`, `app.api.v1.safety`)**:
   - Field observations, safety inspections, compliance checklists, human-reported safety incidents, lost-time tracking, evidence vaults.
6. **Corrective Action Center (`app.models.actions`, `app.api.v1.actions`)**:
   - Centralized issue tracking originating from safety, quality, or audit sources. Status transitions, assignments, closure audits.
7. **Weekly Insights & Governance (`app.models.weekly`, `app.api.v1.weekly_reports`)**:
   - Departmental inputs (Safety/Quality) -> Site Manager consolidated submission -> Controller review & discrepancy flagging -> Site Manager resubmission -> Controller validation -> Organization Admin approval & publication.
8. **Eight-KRA Ranking Engine (`app.services.ranking_service`, `app.api.v1.rankings`)**:
   - Single authoritative deterministic calculation engine. Missing data policy ($DCI$ thresholds), provisional scoring, stale data tagging, immutable snapshot archives.
9. **Spreadsheet Management & Integration (`app.services.spreadsheet_service`, `app.api.v1.spreadsheets`)**:
   - Excel templates, parsing, column mapping, dry-run validation, row-level error reporting, atomic transactional database commits.
10. **Document Intelligence & AI Chatbot (`app.services.chatbot_service`, `app.api.v1.chatbot`)**:
    - Governed RAG pipeline. Permission-aware SQL metric queries + approved construction document search with full citations.
11. **Governance & Audit Ledger (`app.models.audit`, `app.api.v1.audit`)**:
    - Append-only audit logs, JSON delta diffs, user tracking, IP logging.

---

## 2. Infrastructure & Deployment Model

- **Database**: PostgreSQL 16 with `pgvector` extension for document embeddings.
- **Cache / Task Queue**: Redis 7.
- **Backend**: Python 3.14 / 3.12+ with FastAPI, Pydantic v2, SQLAlchemy 2.0 (Async + Sync support), Alembic migrations.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui design tokens, Recharts, TanStack Query.
- **Hybrid Gateway**: Supports cloud deployment with optional outbound-only data bridge for on-premises infrastructure.
