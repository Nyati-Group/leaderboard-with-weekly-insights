import uuid
from app.core.odm import (
    Column, String, Text, Integer, ForeignKey, JSON, DateTime, Boolean
)
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

class DocumentUpload(Base, TimestampMixin):
    __tablename__ = "document_uploads"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)  # PDF, DOCX, TXT, DWG_SPEC
    file_size_bytes = Column(Integer, nullable=False)
    status = Column(String(30), default="PROCESSED", nullable=False)  # UPLOADED, PROCESSING, PROCESSED, FAILED
    uploaded_by = Column(GUID(), ForeignKey("users.id"), nullable=False)

    site = relationship("Site")
    uploader = relationship("User")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DocumentChunk(Base, TimestampMixin):
    __tablename__ = "document_chunks"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    document_id = Column(GUID(), ForeignKey("document_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content_text = Column(Text, nullable=False)
    section_title = Column(String(200), nullable=True)
    token_count = Column(Integer, default=0, nullable=False)

    document = relationship("DocumentUpload", back_populates="chunks")
    site = relationship("Site")

class ChatConversation(Base, TimestampMixin):
    __tablename__ = "chat_conversations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True, index=True)  # Null if portfolio scope
    title = Column(String(255), default="Construction Inquiry", nullable=False)

    user = relationship("User")
    site = relationship("Site")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID(), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender = Column(String(20), nullable=False)  # USER, ASSISTANT
    message_text = Column(Text, nullable=False)
    citations_json = Column(JSON, nullable=True)  # List of exact record / chunk citations
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    conversation = relationship("ChatConversation", back_populates="messages")
