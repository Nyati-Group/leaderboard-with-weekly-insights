import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

class KRADefinitionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str
    is_composite: bool

class RankingWeightSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kra_id: int
    weight_pct: float
    kra: Optional[KRADefinitionSchema] = None

class RankingMethodologySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_code: str
    name: str
    is_active: bool
    approved_at: Optional[datetime] = None
    rationale: Optional[str] = None
    weights: List[RankingWeightSchema] = []

class RankingScoreSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kra_id: int
    raw_score: Optional[float] = None
    weighted_score: Optional[float] = None
    is_missing: bool
    details_json: Optional[Dict[str, Any]] = None

class RankingSnapshotSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: str
    site_name: Optional[str] = None
    period_id: str
    composite_score: Optional[float] = None
    data_completeness_pct: float
    is_stale: bool
    ranking_position: Optional[int] = None
    status: str
    calculated_at: datetime
    scores: List[RankingScoreSchema] = []

class CalculateRankingRequest(BaseModel):
    period_id: str = "2026-W44"
    methodology_id: Optional[uuid.UUID] = None
