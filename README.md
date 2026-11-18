# Construction Site Leadership Dashboard
## Enterprise Construction Management & Leadership Intelligence Platform

**Architecture:** Modular Monolith (FastAPI + React/TypeScript + MongoDB)  
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
- A MongoDB database: MongoDB Atlas (recommended) or a local `mongod`

### 1. Backend Setup
```bash
# Activate virtual environment
.\venv\Scripts\Activate.ps1  # Windows PowerShell

cd backend
pip install -r requirements.txt

# Configure MongoDB: copy .env.example to .env and set MONGODB_URI / MONGODB_DB_NAME
# (default database name: site_leaderboard_weekly_insights)

# Create indexes and seed 6 roles, 5 sites, 18 accounts and sample data (idempotent)
python -m app.core.seed

# Start FastAPI dev server (the Vite dev proxy targets port 8001)
uvicorn app.main:app --reload --port 8001
```

There are no schema migrations: collections are created on first write and
`python -m app.core.seed` (re)creates the unique/lookup indexes.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
- Open `http://localhost:5175` in your browser.

---

## 3. Deploying to Vercel

The repository deploys as a single Vercel project (no Docker):
- `frontend/` is built as static assets (`vercel.json` → `frontend/dist`).
- `api/index.py` exposes the FastAPI app as a Python serverless function; every `/api/*` request is routed to it.

Steps:
1. Import the repository in Vercel (root directory = repository root; settings come from `vercel.json`).
2. Add environment variables: `MONGODB_URI`, `MONGODB_DB_NAME`, `SECRET_KEY`, and optionally `GEMINI_API_KEY`, `GEMINI_MODEL`, `ENVIRONMENT=production`, `DEBUG=false`.
3. In MongoDB Atlas → Network Access, allow connections from Vercel (e.g. `0.0.0.0/0`, since Vercel functions have no fixed IPs).
4. Seed the database once from your machine: `cd backend && python -m app.core.seed`.

---

## 4. Running Automated Tests

The backend tests run against a seeded MongoDB database. Point them at a throwaway database rather than production:

```bash
cd backend
$env:MONGODB_URI="mongodb://localhost:27017"; $env:MONGODB_DB_NAME="cld_test"
python -m app.core.seed
pytest

# Run frontend typecheck and build
cd ../frontend
npm run build
```

---

## 5. Phase Verification Checklist

- [x] **Phase 0:** Requirements analysis, 11-domain ERD, 6-role RBAC matrix, REST API contracts, 8-KRA ranking engine formulation.
- [x] **Phase 1:** Monorepo structure, FastAPI backend, React 19 / TypeScript frontend, Tailwind CSS v4, MongoDB persistence layer, health checks, seed script, automated test suite, GitHub Actions CI.
- [ ] **Phase 2:** Authentication, JWT session management, 3-tier RBAC enforcement, and user management.
- [ ] **Phase 3:** Site portfolio management and daily field operations.
- [ ] **Phase 4:** Quality, safety inspections, incident tracking, and corrective actions center.
- [ ] **Phase 5:** Authoritative Eight-KRA ranking engine.
- [ ] **Phase 6:** Weekly insights and governance workflow.
- [ ] **Phase 7:** Excel spreadsheet import engine and EVM analytics.
- [ ] **Phase 8:** Governed AI chatbot and document intelligence RAG.
- [ ] **Phase 9:** Production readiness, load testing, and deployment verification.
