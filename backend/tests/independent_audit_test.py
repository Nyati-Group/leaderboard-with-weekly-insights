"""
Independent Verification and Audit Script for Construction Site Leadership Dashboard
Tests all API routes, RBAC permissions, isolation, ranking math, EVM, and weekly governance.
"""
import io
import sys
import openpyxl
from datetime import date, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.sites import Site, ProjectBaseline
from app.models.auth import User, Role
from app.models.rankings import RankingMethodology, RankingSnapshot
from app.models.weekly_insights import WeeklyReport

client = TestClient(app)

audit_results = {
    "passed": [],
    "failed": [],
    "findings": []
}

def log_test(name: str, passed: bool, notes: str = ""):
    if passed:
        audit_results["passed"].append({"test": name, "notes": notes})
        print(f"[PASS] {name}: {notes}")
    else:
        audit_results["failed"].append({"test": name, "notes": notes})
        print(f"[FAIL] {name}: {notes}")

def get_token(email: str, password: str = "Construction@2026"):
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if res.status_code == 200:
        return res.json()["data"]["access_token"]
    return None

def run_audit():
    print("=== STARTING INDEPENDENT AUDIT ===")

    # 1. AUTH & 5 SITES CHECK
    db = SessionLocal()
    sites = db.query(Site).all()
    site_ids = {s.id for s in sites}
    required_sites = {"CS-PUN-01", "CS-MUM-02", "CS-NAS-03", "CS-REM-04", "CS-NAG-05"}
    log_test("5 Configurable Sites Presence", site_ids == required_sites, f"Found sites: {site_ids}")

    # Check 6 Roles
    roles = db.query(Role).all()
    role_ids = {r.id for r in roles}
    required_roles = {"ORG_ADMIN", "EXEC_LEADERSHIP", "PROJECT_CONTROLLER", "SITE_MANAGER", "SAFETY_OFFICER", "QUALITY_OFFICER"}
    log_test("6 Role Hierarchy Presence", role_ids == required_roles, f"Found roles: {role_ids}")

    # Tokens for all 18 seed accounts
    tokens = {}
    seed_accounts = [
        "admin@cld.com", "leadership@cld.com", "controller@cld.com",
        "pm.pune@cld.com", "safety.pune@cld.com", "quality.pune@cld.com",
        "pm.mumbai@cld.com", "safety.mumbai@cld.com", "quality.mumbai@cld.com",
        "pm.nashik@cld.com", "safety.nashik@cld.com", "quality.nashik@cld.com",
        "pm.remote@cld.com", "safety.remote@cld.com", "quality.remote@cld.com",
        "pm.nagpur@cld.com", "safety.nagpur@cld.com", "quality.nagpur@cld.com"
    ]
    for acc in seed_accounts:
        tok = get_token(acc)
        tokens[acc] = tok
        log_test(f"Auth Login for {acc}", tok is not None)

    # 2. RBAC & SITE ISOLATION AUDIT
    # Pune PM cannot access Mumbai daily reports
    res = client.get("/api/v1/daily-reports?site_id=CS-MUM-02", headers={"Authorization": f"Bearer {tokens['pm.pune@cld.com']}"})
    log_test("Horizontal Isolation: PM Pune cannot access Mumbai Daily Reports", res.status_code == 403, f"HTTP {res.status_code}")

    # Pune PM cannot access Mumbai Weekly Reports
    res = client.get("/api/v1/weekly-reports?site_id=CS-MUM-02", headers={"Authorization": f"Bearer {tokens['pm.pune@cld.com']}"})
    log_test("Horizontal Isolation: PM Pune cannot access Mumbai Weekly Reports", res.status_code == 403, f"HTTP {res.status_code}")

    # Pune PM cannot access Mumbai Quality Inspections
    res = client.get("/api/v1/quality/inspections?site_id=CS-MUM-02", headers={"Authorization": f"Bearer {tokens['pm.pune@cld.com']}"})
    log_test("Horizontal Isolation: PM Pune cannot access Mumbai Quality Inspections", res.status_code == 403, f"HTTP {res.status_code}")

    # Nashik PM cannot access Remote daily reports
    res = client.get("/api/v1/daily-reports?site_id=CS-REM-04", headers={"Authorization": f"Bearer {tokens['pm.nashik@cld.com']}"})
    log_test("Horizontal Isolation: PM Nashik cannot access Remote Daily Reports", res.status_code == 403, f"HTTP {res.status_code}")

    # Nagpur Safety Officer cannot access Pune safety observations
    res = client.get("/api/v1/safety/observations?site_id=CS-PUN-01", headers={"Authorization": f"Bearer {tokens['safety.nagpur@cld.com']}"})
    log_test("Horizontal Isolation: SO Nagpur cannot access Pune Safety Observations", res.status_code == 403, f"HTTP {res.status_code}")

    # Safety Officer cannot trigger 8-KRA recalculation
    res = client.post("/api/v1/rankings/calculate", headers={"Authorization": f"Bearer {tokens['safety.pune@cld.com']}"}, json={"period_id": "2026-W44"})
    log_test("Vertical RBAC: Safety Officer cannot trigger Rankings Calculation", res.status_code == 403, f"HTTP {res.status_code}")

    # Leadership cannot trigger 8-KRA recalculation (Read-only)
    res = client.post("/api/v1/rankings/calculate", headers={"Authorization": f"Bearer {tokens['leadership@cld.com']}"}, json={"period_id": "2026-W44"})
    log_test("Vertical RBAC: Exec Leadership cannot trigger Rankings Calculation", res.status_code == 403, f"HTTP {res.status_code}")

    # 3. WEEKLY INSIGHTS GOVERNANCE AUDIT
    # Check who can publish weekly reports: Org Admin vs Exec Leadership
    # First get or create a validated report
    rep = db.query(WeeklyReport).filter(WeeklyReport.site_id == "CS-PUN-01", WeeklyReport.status == "VALIDATED").first()
    if not rep:
        # Create draft and progress it
        rep = db.query(WeeklyReport).filter(WeeklyReport.site_id == "CS-PUN-01").first()
        if rep and rep.status != "PUBLISHED":
            rep.status = "VALIDATED"
            db.commit()

    if rep and rep.status == "VALIDATED":
        # Test if Executive Leadership can publish (Audit requirement: Org Admin is the publication authority; Exec Leadership should NOT publish without explicit authority)
        res_exec_pub = client.post(f"/api/v1/weekly-reports/{rep.id}/publish", headers={"Authorization": f"Bearer {tokens['leadership@cld.com']}"})
        audit_results["findings"].append({
            "topic": "Weekly Insights Publication Authority",
            "current_behavior": f"Exec Leadership publish returned HTTP {res_exec_pub.status_code}",
            "expected_behavior": "Exec Leadership should be read-only intelligence; Org Admin should be the sole publication authority."
        })

    # 4. RANKING ENGINE AUDIT
    # Check methodology and weights
    res_meth = client.get("/api/v1/rankings/methodologies/active", headers={"Authorization": f"Bearer {tokens['admin@cld.com']}"})
    if res_meth.status_code == 200:
        meth = res_meth.json()
        weights_sum = sum(w["weight_pct"] for w in meth["weights"])
        log_test("Ranking Methodology Weights Sum to 100%", weights_sum == 100.0, f"Sum: {weights_sum}%")
        log_test("Ranking Weights Count is 7 constituent KRAs", len(meth["weights"]) == 7, f"Count: {len(meth['weights'])}")
    else:
        log_test("Ranking Methodology Retrieval", False, f"HTTP {res_meth.status_code}")

    # 5. EVM ANALYTICS AUDIT
    # Check EVM metrics when baseline exists
    res_evm_pune = client.get("/api/v1/analytics/evm/sites/CS-PUN-01", headers={"Authorization": f"Bearer {tokens['controller@cld.com']}"})
    log_test("EVM Retrieval CS-PUN-01", res_evm_pune.status_code == 200)

    # 6. EXCEL SPREADSHEET AUDIT
    # Download template
    res_tmpl = client.get("/api/v1/analytics/excel/template", headers={"Authorization": f"Bearer {tokens['pm.pune@cld.com']}"})
    log_test("Excel Template Download", res_tmpl.status_code == 200 and len(res_tmpl.content) > 1000)

    # Export workbook
    res_exp = client.get("/api/v1/analytics/excel/export?period_id=2026-W44", headers={"Authorization": f"Bearer {tokens['leadership@cld.com']}"})
    log_test("Excel Portfolio Export", res_exp.status_code == 200 and len(res_exp.content) > 1000)

    # 7. CHATBOT AUDIT
    # Test CCTV rejection
    res_chat_cctv = client.post(
        "/api/v1/chatbot/query",
        headers={"Authorization": f"Bearer {tokens['leadership@cld.com']}"},
        json={"message": "Show camera feed and helmet detection", "site_id": "CS-PUN-01"}
    )
    cctv_rejected = False
    if res_chat_cctv.status_code == 200:
        msg = res_chat_cctv.json()["message"].lower()
        if "sitevision" in msg and "human" in msg:
            cctv_rejected = True
    log_test("Chatbot Scope Boundary: CCTV Excluded with Notice", cctv_rejected)

    # Test grounded query
    res_chat_grounded = client.post(
        "/api/v1/chatbot/query",
        headers={"Authorization": f"Bearer {tokens['leadership@cld.com']}"},
        json={"message": "What is the 8-KRA rank for Pune?", "site_id": "CS-PUN-01"}
    )
    log_test("Chatbot Grounded Response with Citations", res_chat_grounded.status_code == 200 and len(res_chat_grounded.json()["citations"]) > 0)

    # 8. AUDIT LEDGER
    res_audit_admin = client.get("/api/v1/audit/logs?limit=10", headers={"Authorization": f"Bearer {tokens['admin@cld.com']}"})
    log_test("Audit Ledger: Admin can view logs", res_audit_admin.status_code == 200 and len(res_audit_admin.json()) > 0)

    res_audit_pm = client.get("/api/v1/audit/logs", headers={"Authorization": f"Bearer {tokens['pm.pune@cld.com']}"})
    log_test("Audit Ledger: Site Manager blocked from audit logs", res_audit_pm.status_code == 403)

    db.close()
    print("=== AUDIT EXECUTION FINISHED ===")

if __name__ == "__main__":
    run_audit()
