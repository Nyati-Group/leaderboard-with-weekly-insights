from typing import Generic, TypeVar, Optional, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginationMeta(BaseModel):
    page: int = 1
    page_size: int = 25
    total_count: int = 0
    total_pages: int = 1

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ResponseMeta(BaseModel):
    timestamp: datetime = Field(default_factory=get_utc_now)
    request_id: Optional[str] = None
    pagination: Optional[PaginationMeta] = None

class ErrorDetail(BaseModel):
    field: Optional[str] = None
    issue: str

class ErrorPayload(BaseModel):
    code: str
    message: str
    details: Optional[List[ErrorDetail]] = None

class StandardResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    meta: ResponseMeta = Field(default_factory=ResponseMeta)
    error: Optional[ErrorPayload] = None
