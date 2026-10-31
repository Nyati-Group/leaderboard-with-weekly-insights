import io
import uuid
from datetime import date, datetime
from typing import Dict, Any, List
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from sqlalchemy.orm import Session

from app.models.sites import Site
from app.models.rankings import RankingSnapshot, RankingScore
from app.models.operations import (
    DailyReport, ProgressRecord, ManpowerRecord, ExpenditureRecord
)
from app.models.quality_safety import QualityInspection, SafetyInspection

HEADER_FILL = PatternFill(start_color="023B77", end_color="023B77", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="023B77")

class ExcelService:
    @staticmethod
    def generate_daily_report_template() -> io.BytesIO:
        """
        Creates an official blank Excel data entry template with standard formatting.
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Daily Operations Input"

        headers = [
            "Site ID", "Reporting Date (YYYY-MM-DD)", "Work Package", "Activity Name",
            "Planned Qty", "Actual Qty", "Unit (UOM)", "Trade Category", "Trade Labor Count",
            "Cost Code", "Cost Category", "Planned Spend (INR)", "Actual Spend (INR)", "Vendor / Subcontractor"
        ]

        ws.append(headers)

        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_num)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = 20

        # Sample row for guidance
        sample_row = [
            "CS-PUN-01", str(date.today()), "Superstructure", "Slab Concrete Pouring",
            50.0, 48.5, "cum", "Carpenters & Formwork", 20,
            "MAT-CONC-01", "Materials", 320000.0, 315000.0, "UltraTech Cement"
        ]
        ws.append(sample_row)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @staticmethod
    def export_portfolio_workbook(db: Session, period_id: str = "2026-W44") -> io.BytesIO:
        """
        Generates an authoritative, comprehensive multi-tab executive export workbook.
        """
        wb = openpyxl.Workbook()
        
        # ----------------------------------------------------
        # Sheet 1: Leaderboard
        # ----------------------------------------------------
        ws_lead = wb.active
        ws_lead.title = "Leaderboard & 8-KRA"

        lead_headers = [
            "Rank", "Site ID", "Site Name", "Composite Score", "Data Completeness %",
            "Ranking Status", "K1: Progress (20%)", "K2: Manpower (15%)", "K3: Cost (20%)",
            "K4: Schedule (15%)", "K5: Quality (10%)", "K6: Safety (10%)", "K7: Closure (10%)"
        ]
        ws_lead.append(lead_headers)
        for col_idx in range(1, len(lead_headers) + 1):
            c = ws_lead.cell(row=1, column=col_idx)
            c.fill = HEADER_FILL
            c.font = HEADER_FONT
            c.alignment = Alignment(horizontal="center", vertical="center")
            ws_lead.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 18

        snapshots = db.query(RankingSnapshot).filter(
            RankingSnapshot.period_id == period_id
        ).order_by(RankingSnapshot.ranking_position.asc().nullslast()).all()

        for s in snapshots:
            scores_map = {sc.kra_id: (sc.raw_score if not sc.is_missing else "Missing") for sc in s.scores}
            row = [
                f"#{s.ranking_position}" if s.ranking_position else "Unranked",
                s.site_id,
                s.site.name if s.site else s.site_id,
                float(s.composite_score) if s.composite_score is not None else "N/A",
                f"{float(s.data_completeness_pct)}%",
                s.status,
                scores_map.get(1, "N/A"),
                scores_map.get(2, "N/A"),
                scores_map.get(3, "N/A"),
                scores_map.get(4, "N/A"),
                scores_map.get(5, "N/A"),
                scores_map.get(6, "N/A"),
                scores_map.get(7, "N/A"),
            ]
            ws_lead.append(row)

        # ----------------------------------------------------
        # Sheet 2: Daily Operations & Progress
        # ----------------------------------------------------
        ws_prog = wb.create_sheet(title="Field Progress Log")
        prog_headers = ["Site ID", "Date", "Work Package", "Activity", "Planned Qty", "Actual Qty", "UOM", "Cumulative"]
        ws_prog.append(prog_headers)
        for col_idx in range(1, len(prog_headers) + 1):
            c = ws_prog.cell(row=1, column=col_idx)
            c.fill = HEADER_FILL
            c.font = HEADER_FONT
            ws_prog.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 20

        progress_recs = db.query(ProgressRecord).join(DailyReport).order_by(DailyReport.reporting_date.desc()).limit(200).all()
        for p in progress_recs:
            ws_prog.append([
                p.site_id,
                str(p.daily_report.reporting_date) if p.daily_report else "N/A",
                p.work_package,
                p.activity_name,
                float(p.planned_quantity),
                float(p.actual_quantity),
                p.unit_of_measure,
                float(p.cumulative_quantity) if p.cumulative_quantity else 0.0
            ])

        # ----------------------------------------------------
        # Sheet 3: Cost & Expenditure
        # ----------------------------------------------------
        ws_cost = wb.create_sheet(title="Expenditures & Cost")
        cost_headers = ["Site ID", "Date", "Cost Code", "Category", "Planned Spend (INR)", "Actual Spend (INR)", "Variance", "Vendor"]
        ws_cost.append(cost_headers)
        for col_idx in range(1, len(cost_headers) + 1):
            c = ws_cost.cell(row=1, column=col_idx)
            c.fill = HEADER_FILL
            c.font = HEADER_FONT
            ws_cost.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 20

        exp_recs = db.query(ExpenditureRecord).join(DailyReport).order_by(DailyReport.reporting_date.desc()).limit(200).all()
        for e in exp_recs:
            planned = float(e.planned_amount)
            actual = float(e.actual_amount)
            ws_cost.append([
                e.site_id,
                str(e.daily_report.reporting_date) if e.daily_report else "N/A",
                e.cost_code,
                e.category,
                planned,
                actual,
                planned - actual,
                e.vendor_name or "N/A"
            ])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @staticmethod
    def parse_and_validate_spreadsheet(
        db: Session,
        file_bytes: bytes,
        site_id: str,
        user_id: uuid.UUID,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Validates row-by-row and imports operations spreadsheet into DailyReport models.
        """
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            return {"valid": False, "errors": [f"Invalid Excel file format: {str(e)}"], "rows_processed": 0}

        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            return {"valid": False, "errors": ["Spreadsheet must contain at least a header and one data row."], "rows_processed": 0}

        errors: List[str] = []
        parsed_records: List[Dict[str, Any]] = []

        for row_idx, r in enumerate(rows[1:], start=2):
            if not any(r):
                continue  # skip empty lines

            r_site = str(r[0]).strip() if r[0] else site_id
            if r_site != site_id:
                errors.append(f"Row {row_idx}: Site ID '{r_site}' does not match target upload site '{site_id}'.")
                continue

            r_date_str = str(r[1]).strip() if r[1] else None
            try:
                if isinstance(r[1], (datetime, date)):
                    r_date = r[1] if isinstance(r[1], date) else r[1].date()
                elif r_date_str:
                    r_date = datetime.strptime(r_date_str[:10], "%Y-%m-%d").date()
                else:
                    raise ValueError("Date missing")
            except Exception:
                errors.append(f"Row {row_idx}: Invalid date format in column 2. Expected YYYY-MM-DD.")
                continue

            work_package = str(r[2]).strip() if len(r) > 2 and r[2] else None
            activity_name = str(r[3]).strip() if len(r) > 3 and r[3] else None
            if not work_package or not activity_name:
                errors.append(f"Row {row_idx}: Work package and activity name are required.")
                continue

            try:
                planned_qty = float(r[4]) if len(r) > 4 and r[4] is not None else 0.0
                actual_qty = float(r[5]) if len(r) > 5 and r[5] is not None else 0.0
                uom = str(r[6]).strip() if len(r) > 6 and r[6] else "units"
            except Exception:
                errors.append(f"Row {row_idx}: Quantities must be numeric.")
                continue

            trade_category = str(r[7]).strip() if len(r) > 7 and r[7] else None
            trade_count = int(r[8]) if len(r) > 8 and r[8] is not None else 0

            cost_code = str(r[9]).strip() if len(r) > 9 and r[9] else None
            cost_cat = str(r[10]).strip() if len(r) > 10 and r[10] else "Materials"
            planned_spend = float(r[11]) if len(r) > 11 and r[11] is not None else 0.0
            actual_spend = float(r[12]) if len(r) > 12 and r[12] is not None else 0.0
            vendor = str(r[13]).strip() if len(r) > 13 and r[13] else None

            parsed_records.append({
                "site_id": r_site,
                "date": r_date,
                "work_package": work_package,
                "activity_name": activity_name,
                "planned_qty": planned_qty,
                "actual_qty": actual_qty,
                "uom": uom,
                "trade_category": trade_category,
                "trade_count": trade_count,
                "cost_code": cost_code,
                "cost_cat": cost_cat,
                "planned_spend": planned_spend,
                "actual_spend": actual_spend,
                "vendor": vendor
            })

        if errors:
            return {
                "valid": False,
                "errors": errors,
                "rows_processed": len(parsed_records)
            }

        if dry_run:
            return {
                "valid": True,
                "dry_run": True,
                "rows_valid": len(parsed_records),
                "message": f"Pre-validation successful for {len(parsed_records)} rows. Ready to commit."
            }

        # Commit to DB transactionally
        for item in parsed_records:
            # Check or create DailyReport for this date
            report = db.query(DailyReport).filter(
                DailyReport.site_id == site_id,
                DailyReport.reporting_date == item["date"]
            ).first()

            if not report:
                report = DailyReport(
                    site_id=site_id,
                    reporting_date=item["date"],
                    status="SUBMITTED",
                    current_version=1,
                    submitted_by=user_id,
                    site_manager_remarks=f"Bulk imported from Excel on {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                )
                db.add(report)
                db.flush()

            # Add progress record
            db.add(ProgressRecord(
                daily_report_id=report.id,
                site_id=site_id,
                work_package=item["work_package"],
                activity_name=item["activity_name"],
                unit_of_measure=item["uom"],
                planned_quantity=item["planned_qty"],
                actual_quantity=item["actual_qty"],
                cumulative_quantity=item["actual_qty"]
            ))

            # Add manpower record if provided
            if item["trade_category"]:
                db.add(ManpowerRecord(
                    daily_report_id=report.id,
                    site_id=site_id,
                    trade_category=item["trade_category"],
                    contractor_name="Excel Imported Contractor",
                    planned_count=item["trade_count"],
                    actual_count=item["trade_count"],
                    overtime_hours=0.0
                ))

            # Add expenditure record if provided
            if item["cost_code"]:
                db.add(ExpenditureRecord(
                    daily_report_id=report.id,
                    site_id=site_id,
                    cost_code=item["cost_code"],
                    category=item["cost_cat"],
                    planned_amount=item["planned_spend"],
                    actual_amount=item["actual_spend"],
                    vendor_name=item["vendor"] or "Excel Imported Vendor"
                ))

        db.commit()

        return {
            "valid": True,
            "dry_run": False,
            "rows_committed": len(parsed_records),
            "message": f"Successfully imported and committed {len(parsed_records)} operational records."
        }
