import io
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.services.excel_service import ExcelService
from app.services.evm_service import EVMService

router = APIRouter(prefix="/analytics", tags=["Analytics, EVM & Excel Data Ingestion"])

@router.get("/evm/portfolio")
def get_portfolio_evm(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns aggregated Earned Value Management (EVM) metrics across all active construction sites.
    """
    return EVMService.calculate_portfolio_evm(db)

@router.get("/evm/sites/{site_id}")
def get_site_evm(
    site_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Returns site-specific EVM indices (BAC, PV, EV, AC, SPI, CPI, SV, CV, EAC) and S-Curve data points.
    """
    if not current_user.can_access_site(site_id):
        raise HTTPException(status_code=403, detail="Access denied for requested site.")
    try:
        return EVMService.calculate_site_evm(db, site_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/excel/template")
def download_excel_template(
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Downloads the official Excel data entry template.
    """
    buffer = ExcelService.generate_daily_report_template()
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Daily_Operations_Template.xlsx"}
    )

@router.get("/excel/export")
def export_portfolio_excel(
    period_id: str = Query("2026-W44"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Exports a comprehensive multi-tab executive workbook with Leaderboard, Progress, and Costs.
    """
    buffer = ExcelService.export_portfolio_workbook(db, period_id=period_id)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Construction_Portfolio_Export_{period_id}.xlsx"}
    )

@router.post("/excel/import")
async def import_excel_data(
    file: UploadFile = File(...),
    site_id: str = Form(...),
    dry_run: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Uploads and imports Excel field records with strict row-by-row validation.
    """
    if not current_user.can_access_site(site_id):
        raise HTTPException(status_code=403, detail="Access denied for target site.")

    # Restrict import to Site Manager, Controller, and Admin
    user_roles = set(current_user.roles)
    if not user_roles.intersection({"SITE_MANAGER", "PROJECT_CONTROLLER", "ORG_ADMIN"}):
        raise HTTPException(
            status_code=403,
            detail="Only Site Managers, Project Controllers, and Admins can import operational spreadsheets."
        )

    file_bytes = await file.read()
    result = ExcelService.parse_and_validate_spreadsheet(
        db=db,
        file_bytes=file_bytes,
        site_id=site_id,
        user_id=current_user.id,
        dry_run=dry_run
    )

    if not result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Spreadsheet validation failed", "errors": result["errors"]}
        )

    return result
