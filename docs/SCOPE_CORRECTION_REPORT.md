# Scope Correction Report: Removal of CCTV & Computer Vision Requirements
**Project:** Construction Site Leadership Dashboard  
**Date:** 2026-10-31  
**Status:** Approved & Implemented Across Blueprint and Codebase  

---

## 1. Executive Summary & Purpose
This report documents the complete removal of all CCTV, IP camera, ONVIF/RTSP streaming, and automated computer-vision (PPE detection) requirements from the **Construction Site Leadership Dashboard**.

**Crucial Project Boundary**:
- **SiteVision**: The separate independent system handling physical camera hardware, video streaming, RTSP ingest, and edge computer-vision AI models.
- **Construction Site Leadership Dashboard**: The enterprise leadership intelligence platform handling consolidated progress, deterministic 8-KRA performance rankings, field operations, manual quality inspections/NCRs, manual safety audits/incidents, corrective actions, Excel import/export, and governed chatbot intelligence.

---

## 2. CCTV-Related Requirements Removed

The following capabilities have been completely purged from specifications, models, routes, and roadmaps:
1. **IP Camera Connectivity & RTSP/ONVIF Streaming**: No camera hardware interfaces or stream relays.
2. **AI PPE Detection**: No automated helmet, safety vest, or safety boot computer vision detection models.
3. **CCTV Detection Triage States**: Removed the intermediate `DETECTED` and `PENDING_REVIEW` states previously designed for raw machine-learning outputs.
4. **Camera Management & Feeds**: No camera configuration screens, stream viewers, or video evidence transcoders.
5. **Background Video Workers**: Removed asynchronous video-processing queues and GPU worker specifications.

---

## 3. Database Entities Removed or Revised

### Removed Entities
- `cctv_detections`: (camera_id, timestamp, hazard_type, confidence_score, snapshot_path, detection_status) — **Completely Deleted**.
- `safety_reviews`: (review of AI camera detections) — **Completely Deleted**.
- `camera_devices`, `camera_streams`, `detection_events` — **Strictly Excluded**.

### Retained & Refined Safety Entities (100% Human-Reported & Audited)
- **`safety_inspections`**: Walkthroughs and compliance audits conducted by the Safety Officer (`inspection_date`, `inspector_id`, `compliance_score_pct`, `remarks`).
- **`safety_checklist_items`**: Standardized inspection parameters (`PPE_COMPLIANCE`, `SCAFFOLDING`, `ELECTRICAL`, `HOUSEKEEPING`, `is_compliant`, `severity`).
- **`safety_observations`**: Field observations logged directly by site personnel (`observer_id`, `category`, `severity`, `status`).
- **`safety_incidents`**: Manually reported and verified safety incidents (`incident_date`, `severity`: `NEAR_MISS`, `FIRST_AID`, `MEDICAL_TREATMENT`, `LOST_TIME`, `FATALITY`, `injured_count`, `lost_time_hours`, `root_cause`, `status`).
- **`safety_evidence`**: Photos and documents manually attached by authorized users (`file_path`, `uploaded_by`, `uploaded_at`).

---

## 4. API Routes & Services Removed or Revised

### Removed Endpoints
- `GET /api/v1/safety/cctv-detections`
- `POST /api/v1/safety/cctv-detections/{id}/review`
- `GET /api/v1/cameras`
- `POST /api/v1/cameras`

### Retained Safety Endpoints (`/api/v1/safety`)
- `GET /api/v1/safety/inspections`: List manual safety inspection reports.
- `POST /api/v1/safety/inspections`: Safety Officer creates a new inspection with checklist items.
- `GET /api/v1/safety/observations`: List field safety observations.
- `POST /api/v1/safety/observations`: Log an observation with severity and corrective action trigger.
- `GET /api/v1/safety/incidents`: List verified safety incidents.
- `POST /api/v1/safety/incidents`: Report a safety incident with lost-time calculation.

---

## 5. Ranking Calculation Changes (KRA 6)

The 8 KRA categories and weights remain exactly as specified in the original architecture:
1. Construction Progress (20%)
2. Manpower Utilization (15%)
3. Cost & Expenditure (20%)
4. Schedule & Timelines (15%)
5. Work Quality & Rework (10%)
6. **Safety Compliance (10%)**
7. Task & Issue Closure (10%)
8. Overall Site Performance (Composite)

**Safety Compliance (KRA 6) Formula Revision:**
- Previously included conditional weighting around unconfirmed vs confirmed CCTV detections.
- **Revised Formulation**: Derived strictly from human-verified safety records:
  $$S_6 = 0.5 \times \text{Safety Inspection Pass Rate} + 0.5 \times \max\left(0, 100 - (\text{Fatalities} \times 100 + \text{Lost Time Incidents} \times 25 + \text{Minor Incidents} \times 5)\right)$$
- If inspections pass with 100% and 0 incidents occur, $S_6 = 100$.
- Zero input from machine vision.

---

## 6. AI Chatbot Scope Changes

- The chatbot is grounded **exclusively** in:
  1. Authorized relational database records (progress, manpower, cost, manual quality inspections, safety observations, incidents, and corrective actions).
  2. Approved construction documents (GFC drawings, contracts, method statements, specifications).
- The chatbot will **never** query camera feeds, vision detections, or CCTV event logs.
- All safety answers reference the reporting Safety Officer, inspection date, and incident ID.

---

## 7. Confirmation of Preserved Requirements

The following core modules and architecture requirements remain 100% intact:
- **6 Primary Workspaces**: Executive Overview, Site Leaderboard & Portfolio, Weekly Insights, Field Operations, Quality & Safety, Analytics & Audit Ledger.
- **5 Initial Configurable Sites**: `CS-PUN-01`, `CS-MUM-02`, `CS-NAS-03`, `CS-REM-04`, `CS-NAG-05`.
- **Three-Tier RBAC**: 6 roles (`ORG_ADMIN`, `EXEC_LEADERSHIP`, `PROJECT_CONTROLLER`, `SITE_MANAGER`, `SAFETY_OFFICER`, `QUALITY_OFFICER`) with strict horizontal site-level isolation.
- **Daily Field Operations**: Versioned daily progress, manpower headcount/overtime, and expenditure.
- **Quality & NCR Workflow**: Checklist inspections, defect logging, Non-Conformance Reports, and rework tracking.
- **Central Corrective Actions Center**: Lifecycle tracking, assignments, evidence, and closure verification.
- **Excel Spreadsheet Engine**: Templates, parsing, dry-run validation, and transactional commits.
- **Weekly Governance & Approval**: Multi-stage sign-off (SM -> Controller -> Org Admin).
- **Audit Ledger**: Append-only audit logs with diff tracking.
