# Construction Site Leadership Dashboard
## Enterprise Construction Management & Leadership Intelligence Platform

**Architecture:** Modular Monolith (FastAPI + React/TypeScript + PostgreSQL + Redis)  
**Primary Brand Palette:** Navy (`#023B77`), Teal (`#039583`)  

---

## 1. Project Overview

The Construction Site Leadership Dashboard consolidates operational progress, expenditure, quality, safety, and leadership intelligence across multiple construction projects into one authoritative, permission-controlled application.

### Key Capabilities
- **6 Workspaces**:
  1. *Executive Overview*: Portfolio-wide S-curves, milestone adherence, and expenditure variance.
  2. *Site Leaderboard & Portfolio*: 8-KRA transparent performance comparison and ranking.
  3. *Weekly Insights*: Governance workflow (Site Manager -> Controller -> Organization Admin).
  4. *Field Operations*: Daily progress, manpower, expenditure, and versioned report submissions.
  5. *Quality, Safety & Actions*: Manual safety inspections, observations, NCRs, and corrective actions.
  6. *Analytics & Audit Ledger*: Excel import validation, EVM analytics, and append-only audit trail.
- **AI Construction Assistant**: Grounded in structured database metrics and approved site documents.
- **Configured Initial Sites**:
  - `CS-PUN-01`: Pune Commercial Tower
  - `CS-MUM-02`: Mumbai Residential Complex
  - `CS-NAS-03`: Nashik Industrial Facility
  - `CS-REM-04`: Remote Infrastructure Project
  - `CS-NAG-05`: Nagpur Mixed-Use

---

## 2. Quickstart: Local Development

### Prerequisites
- Python 3.12+ (or 3.14)
- Node.js 20+ & npm
- Docker & Docker Compose (optional for local SQLite, required for full PostgreSQL/Redis stack)

### Option A: Running with Docker Compose (Recommended)
```bash
# Start all services (PostgreSQL with pgvector, Redis, FastAPI Backend, React Frontend)
docker compose up -d --build

# Run migrations inside the backend container
docker compose exec backend alembic upgrade head

# Seed initial roles and sites
docker compose exec backend python -m app.core.seed
```
- Frontend UI: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/api/v1/docs`
- Health Endpoint: `http://localhost:8000/api/v1/health`

### Option B: Native Local Development

#### 1. Backend Setup
```bash
# Activate virtual environment
.\venv\Scripts\Activate.ps1  # Windows PowerShell

# Run database migrations
cd backend
alembic upgrade head

# Seed 6 roles and 5 initial sites
python -m app.core.seed

# Start FastAPI dev server
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
- Open `http://localhost:5173` in your browser.

---

## 3. Running Automated Tests

```bash
# Run backend pytest suite (unit, integration, health, and site tests)
cd backend
pytest

# Run frontend typecheck and build
cd ../frontend
npm run build
```

---

## 4. Phase Verification Checklist

- [x] **Phase 0:** Requirements analysis, 11-domain ERD, 6-role RBAC matrix, REST API contracts, 8-KRA ranking engine formulation.
- [x] **Phase 1:** Monorepo structure, FastAPI backend, React 19 / TypeScript frontend, Tailwind CSS v4, PostgreSQL/Alembic schema migrations, health checks, seed script, automated test suite, GitHub Actions CI.
- [ ] **Phase 2:** Authentication, JWT session management, 3-tier RBAC enforcement, and user management.
- [ ] **Phase 3:** Site portfolio management and daily field operations.
- [ ] **Phase 4:** Quality, safety inspections, incident tracking, and corrective actions center.
- [ ] **Phase 5:** Authoritative Eight-KRA ranking engine.
- [ ] **Phase 6:** Weekly insights and governance workflow.
- [ ] **Phase 7:** Excel spreadsheet import engine and EVM analytics.
- [ ] **Phase 8:** Governed AI chatbot and document intelligence RAG.
- [ ] **Phase 9:** Production readiness, load testing, and deployment verification.
