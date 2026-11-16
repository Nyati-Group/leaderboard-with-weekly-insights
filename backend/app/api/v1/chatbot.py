import uuid
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.models.chatbot import ChatConversation, ChatMessage, DocumentUpload
from app.services.chatbot_service import ChatbotService
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/chatbot", tags=["Governed Construction AI Assistant"])

class ChatQueryRequest(BaseModel):
    message: str
    site_id: Optional[str] = None
    conversation_id: Optional[uuid.UUID] = None

class CitationSchema(BaseModel):
    type: str
    reference: str
    label: str
    details: str

class ChatQueryResponse(BaseModel):
    conversation_id: uuid.UUID
    message: str
    citations: List[CitationSchema] = []
    created_at: Any

class ChatMessageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sender: str
    message_text: str
    citations_json: Optional[List[Dict[str, Any]]] = None
    created_at: Any

class ChatConversationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    site_id: Optional[str] = None
    created_at: Any

class DocumentUploadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: str
    filename: str
    file_type: str
    file_size_bytes: int
    status: str
    created_at: Any

@router.post("/query", response_model=ChatQueryResponse)
def query_construction_assistant(
    payload: ChatQueryRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Submits a natural language query to the governed construction assistant.
    Returns answers strictly grounded in database records and approved documents, with citations.
    """
    if payload.site_id and not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Access denied for the requested site.")

    result = ChatbotService.query_assistant(
        db=db,
        user_message=payload.message,
        site_id=payload.site_id,
        conversation_id=payload.conversation_id,
        current_user=current_user
    )
    return result

@router.post("/sync", response_model=StandardResponse[Dict[str, Any]])
def sync_chatbot_knowledge_base(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Reloads and synchronizes the assistant knowledge base with latest live platform data.
    """
    stats = ChatbotService.sync_platform_knowledge(db, current_user)
    return StandardResponse(data=stats, meta=ResponseMeta())

@router.get("/conversations", response_model=List[ChatConversationSchema])
def list_user_conversations(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Lists historical chat conversations for the current authenticated user.
    """
    return db.query(ChatConversation).filter(
        ChatConversation.user_id == current_user.id
    ).order_by(ChatConversation.created_at.desc()).all()

@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessageSchema])
def get_conversation_messages(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Retrieves full message history with citations for a conversation.
    """
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == current_user.id
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id
    ).order_by(ChatMessage.created_at.asc()).all()

@router.get("/documents", response_model=List[DocumentUploadSchema])
def list_approved_documents(
    site_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Lists approved engineering specifications, contracts, and safety manuals.
    """
    query = db.query(DocumentUpload)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Access denied for requested site.")
        query = query.filter(DocumentUpload.site_id == site_id)
    elif not current_user.has_global_scope:
        query = query.filter(DocumentUpload.site_id.in_(current_user.assigned_site_ids))

    return query.order_by(DocumentUpload.created_at.desc()).all()
