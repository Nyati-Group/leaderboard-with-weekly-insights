import uuid
from datetime import date, datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field

class WeeklyInsightItemCreate(BaseModel):
    category: str = Field(..., description="CRITICAL_RISK, MANAGEMENT_PRIORITY, SCHEDULE_SLIPPAGE, MATERIAL_BOTTLENECK, REGULATORY_HOLD")
    title: str
    description: str
    severity: str = "MEDIUM"
    owner_name: Optional[str] = None
    target_date: Optional[date] = None

class WeeklyInsightItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    title: str
    description: str
    severity: str
    owner_name: Optional[str] = None
    target_date: Optional[date] = None
    status: str

class WeeklyDepartmentalInputCreate(BaseModel):
    department: str = Field(..., description="SAFETY, QUALITY, PLANNING, COMMERCIAL")
    narrative: str
    metrics_json: Optional[Dict[str, Any]] = None

class WeeklyDepartmentalInputSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department: str
    author_id: uuid.UUID
    author_name: Optional[str] = None
    status: str
    narrative: str
    metrics_json: Optional[Dict[str, Any]] = None
    submitted_at: datetime

class WeeklyReportReviewCreate(BaseModel):
    decision: str = Field(..., description="FLAGGED or VALIDATED")
    discrepancies_found: Optional[str] = None
    action_items: Optional[str] = None

class WeeklyReportReviewSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_name: Optional[str] = None
    decision: str
    discrepancies_found: Optional[str] = None
    action_items: Optional[str] = None
    created_at: datetime

class WeeklyReportVersionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    created_by: uuid.UUID
    creator_name: Optional[str] = None
    change_summary: Optional[str] = None
    created_at: datetime

class WeeklyReportCreate(BaseModel):
    site_id: str
    week_code: str
    start_date: date
    end_date: date
    executive_summary: Optional[str] = None
    top_achievements: Optional[str] = None
    critical_concerns: Optional[str] = None
    corporate_assistance_needed: Optional[str] = None
    insight_items: List[WeeklyInsightItemCreate] = []

class WeeklyReportUpdate(BaseModel):
    executive_summary: Optional[str] = None
    top_achievements: Optional[str] = None
    critical_concerns: Optional[str] = None
    corporate_assistance_needed: Optional[str] = None
    insight_items: Optional[List[WeeklyInsightItemCreate]] = None

class WeeklyReportSummarySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: str
    site_name: Optional[str] = None
    week_code: str
    start_date: date
    end_date: date
    status: str
    current_version: int
    site_manager_id: uuid.UUID
    site_manager_name: Optional[str] = None
    executive_summary: Optional[str] = None
    published_at: Optional[datetime] = None
    published_by_name: Optional[str] = None
    created_at: datetime

class WeeklyReportDetailSchema(WeeklyReportSummarySchema):
    top_achievements: Optional[str] = None
    critical_concerns: Optional[str] = None
    corporate_assistance_needed: Optional[str] = None
    departmental_inputs: List[WeeklyDepartmentalInputSchema] = []
    insight_items: List[WeeklyInsightItemSchema] = []
    reviews: List[WeeklyReportReviewSchema] = []
    versions: List[WeeklyReportVersionSchema] = []
