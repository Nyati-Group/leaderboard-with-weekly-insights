import io
import pytest
from datetime import date
import openpyxl
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_auth_token(email: str = "admin@cld.com", password: str = "Construction@2026") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    return response.json()["data"]["access_token"]

def test_portfolio_evm_metrics():
    token = get_auth_token("leadership@cld.com")
    res = client.get(
        "/api/v1/analytics/evm/portfolio",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "portfolio_bac" in data
    assert "portfolio_pv" in data
    assert "portfolio_ev" in data
    assert "portfolio_ac" in data
    assert "portfolio_spi" in data
    assert "portfolio_cpi" in data
    assert len(data["site_breakdown"]) >= 5

def test_site_evm_and_s_curve():
    token = get_auth_token("controller@cld.com")
    res = client.get(
        "/api/v1/analytics/evm/sites/CS-PUN-01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["site_id"] == "CS-PUN-01"
    assert data["budget_at_completion"] > 0
    assert len(data["s_curve_points"]) > 0
    # Check that each point has period, pv, and optional ev/ac
    for pt in data["s_curve_points"]:
        assert "period" in pt
        assert "pv" in pt

def test_download_excel_template():
    token = get_auth_token("pm.pune@cld.com")
    res = client.get(
        "/api/v1/analytics/excel/template",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers["content-type"]
    
    # Load workbook from response bytes
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    ws = wb.active
    assert ws.title == "Daily Operations Input"
    assert ws.cell(row=1, column=1).value == "Site ID"

def test_export_portfolio_excel():
    token = get_auth_token("leadership@cld.com")
    res = client.get(
        "/api/v1/analytics/excel/export?period_id=2026-W44",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    sheet_names = wb.sheetnames
    assert "Leaderboard & 8-KRA" in sheet_names
    assert "Field Progress Log" in sheet_names
    assert "Expenditures & Cost" in sheet_names

def test_excel_import_dry_run_and_commit():
    pm_token = get_auth_token("pm.pune@cld.com")

    # Generate a valid test workbook
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([
        "Site ID", "Reporting Date", "Work Package", "Activity Name",
        "Planned Qty", "Actual Qty", "UOM", "Trade Category", "Labor Count",
        "Cost Code", "Cost Category", "Planned Spend", "Actual Spend", "Vendor"
    ])
    ws.append([
        "CS-PUN-01", "2026-10-25", "Finishing", "Internal Plastering",
        100.0, 95.0, "sqm", "Plasterers", 10,
        "MAT-PLAST-01", "Materials", 75000.0, 72000.0, "Birla White"
    ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    # 1. Test Dry Run
    dry_res = client.post(
        "/api/v1/analytics/excel/import",
        headers={"Authorization": f"Bearer {pm_token}"},
        data={"site_id": "CS-PUN-01", "dry_run": "true"},
        files={"file": ("test_ops.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert dry_res.status_code == 200
    assert dry_res.json()["valid"] is True
    assert dry_res.json()["dry_run"] is True

    # 2. Test Actual Commit
    commit_res = client.post(
        "/api/v1/analytics/excel/import",
        headers={"Authorization": f"Bearer {pm_token}"},
        data={"site_id": "CS-PUN-01", "dry_run": "false"},
        files={"file": ("test_ops.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert commit_res.status_code == 200
    assert commit_res.json()["valid"] is True
    assert commit_res.json()["rows_committed"] == 1

def test_excel_import_validation_rejection():
    pm_token = get_auth_token("pm.pune@cld.com")

    # Invalid workbook with mismatched site and non-numeric quantity
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Site ID", "Reporting Date", "Work Package", "Activity Name", "Planned Qty"])
    ws.append(["CS-MUM-02", "INVALID-DATE", "Finishing", "Plastering", "NOT_A_NUMBER"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    res = client.post(
        "/api/v1/analytics/excel/import",
        headers={"Authorization": f"Bearer {pm_token}"},
        data={"site_id": "CS-PUN-01", "dry_run": "true"},
        files={"file": ("invalid_ops.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert res.status_code == 422
    assert "errors" in res.json()["detail"]
    assert len(res.json()["detail"]["errors"]) > 0
