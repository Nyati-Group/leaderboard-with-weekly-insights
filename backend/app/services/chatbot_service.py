import uuid
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.sites import Site, SiteMetadata, ProjectMilestone
from app.models.operations import DailyReport, ProgressRecord, ManpowerRecord, ExpenditureRecord
from app.models.quality_safety import (
    QualityInspection, SafetyInspection, SafetyIncident, CorrectiveAction
)
from app.models.rankings import RankingSnapshot, RankingScore
from app.models.weekly_insights import WeeklyReport, WeeklyInsightItem
from app.models.chatbot import DocumentUpload, DocumentChunk, ChatConversation, ChatMessage
from app.services.audit_service import AuditService
from app.api.deps import AuthenticatedUserContext

class ChatbotService:
    @classmethod
    def query_assistant(
        cls,
        db: Session,
        user_message: str,
        site_id: Optional[str],
        conversation_id: Optional[uuid.UUID],
        current_user: AuthenticatedUserContext
    ) -> Dict[str, Any]:
        """
        Grounded construction assistant: combines authoritative database state and approved document chunks.
        Strictly excludes any CCTV / computer vision data.
        """
        # Role site boundary
        effective_site = site_id
        if not current_user.has_global_scope:
            if not effective_site or not current_user.can_access_site(effective_site):
                effective_site = current_user.assigned_site_ids[0] if current_user.assigned_site_ids else None

        # 1. Retrieve Conversation or create new
        if conversation_id:
            conv = db.query(ChatConversation).filter(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == current_user.id
            ).first()
        else:
            conv = None

        if not conv:
            title = user_message[:40] + ("..." if len(user_message) > 40 else "")
            conv = ChatConversation(
                user_id=current_user.id,
                site_id=effective_site,
                title=title
            )
            db.add(conv)
            db.flush()

        # Save User Message
        user_msg = ChatMessage(
            conversation_id=conv.id,
            sender="USER",
            message_text=user_message
        )
        db.add(user_msg)

        # 2. Gather Grounded DB Context
        citations: List[Dict[str, Any]] = []
        context_lines: List[str] = []

        q_lower = user_message.lower()

        # A. Query Sites / Metadata
        sites_query = db.query(Site)
        if effective_site and effective_site != "ALL":
            sites_query = sites_query.filter(Site.id == effective_site)
        elif not current_user.has_global_scope:
            sites_query = sites_query.filter(Site.id.in_(current_user.assigned_site_ids))
        accessible_sites = sites_query.all()

        for s in accessible_sites:
            context_lines.append(f"Site: {s.name} ({s.id}), Status: {s.status}, Type: {s.project_type}, Timeline: {s.start_date} to {s.target_completion_date}.")
            citations.append({
                "type": "SITE_PROFILE",
                "reference": s.id,
                "label": f"Site Registry: {s.name} ({s.id})",
                "details": f"Contract Start: {s.start_date}, Finish: {s.target_completion_date}"
            })

        # B. Query Leaderboard / 8-KRA Rankings
        ranking_snaps = db.query(RankingSnapshot).filter(
            RankingSnapshot.period_id == "2026-W44"
        )
        if effective_site and effective_site != "ALL":
            ranking_snaps = ranking_snaps.filter(RankingSnapshot.site_id == effective_site)
        snaps = ranking_snaps.all()

        if snaps:
            for snap in snaps:
                context_lines.append(
                    f"Leaderboard (2026-W44): Site {snap.site_id} is Rank #{snap.ranking_position} with Composite Score {snap.composite_score} (DCI: {snap.data_completeness_pct}%, Status: {snap.status})."
                )
                citations.append({
                    "type": "RANKING_ENGINE",
                    "reference": f"{snap.site_id}_2026-W44",
                    "label": f"8-KRA Leaderboard: {snap.site_id} (Rank #{snap.ranking_position})",
                    "details": f"Score: {snap.composite_score}, Status: {snap.status}, DCI: {snap.data_completeness_pct}%"
                })

        # C. Query Weekly Insights
        weekly_query = db.query(WeeklyReport)
        if effective_site and effective_site != "ALL":
            weekly_query = weekly_query.filter(WeeklyReport.site_id == effective_site)
        latest_weekly = weekly_query.order_by(WeeklyReport.start_date.desc()).first()

        if latest_weekly:
            context_lines.append(
                f"Weekly Report ({latest_weekly.week_code}) for {latest_weekly.site_id}: Summary: '{latest_weekly.executive_summary}'. Achievements: '{latest_weekly.top_achievements}'. Critical Concerns: '{latest_weekly.critical_concerns}'. Assistance Needed: '{latest_weekly.corporate_assistance_needed}'."
            )
            citations.append({
                "type": "WEEKLY_REPORT",
                "reference": str(latest_weekly.id),
                "label": f"Weekly Report {latest_weekly.week_code} ({latest_weekly.site_id})",
                "details": f"Status: {latest_weekly.status}, Version: v{latest_weekly.current_version}"
            })

        # D. Query Safety Records (Human-verified manual only, strictly NO CCTV)
        safety_query = db.query(SafetyInspection)
        if effective_site and effective_site != "ALL":
            safety_query = safety_query.filter(SafetyInspection.site_id == effective_site)
        latest_safety = safety_query.order_by(SafetyInspection.inspection_date.desc()).first()
        if latest_safety:
            context_lines.append(
                f"Safety Inspection ({latest_safety.inspection_date}) for {latest_safety.site_id}: Compliance Score: {latest_safety.compliance_score_pct}%, Audited Type: {latest_safety.inspection_type}. Note: Safety metrics strictly human-audited with zero CCTV."
            )
            citations.append({
                "type": "SAFETY_AUDIT",
                "reference": str(latest_safety.id),
                "label": f"Human-Audited Safety Inspection ({latest_safety.site_id})",
                "details": f"Date: {latest_safety.inspection_date}, Compliance: {latest_safety.compliance_score_pct}%"
            })

        # E. Query Document Chunks (RAG)
        doc_query = db.query(DocumentChunk)
        if effective_site and effective_site != "ALL":
            doc_query = doc_query.filter(or_(DocumentChunk.site_id == effective_site, DocumentChunk.site_id == "PORTFOLIO"))
        
        # Simple keyword match on document chunks
        words = [w for w in re.findall(r'\w+', q_lower) if len(w) > 3]
        if words:
            matching_chunks = doc_query.filter(
                or_(*[DocumentChunk.content_text.ilike(f"%{w}%") for w in words[:3]])
            ).limit(2).all()
        else:
            matching_chunks = doc_query.limit(2).all()

        for chunk in matching_chunks:
            context_lines.append(f"Document [{chunk.document.filename if chunk.document else 'Spec'}]: {chunk.content_text}")
            citations.append({
                "type": "APPROVED_DOCUMENT",
                "reference": str(chunk.id),
                "label": f"Approved Doc: {chunk.document.filename if chunk.document else 'Specification'}",
                "details": f"Section: {chunk.section_title or 'General'}, Token Count: {chunk.token_count}"
            })

        # 3. Deterministic Synthesizer with Citations
        # Formulate grounded authoritative answer based on queried context
        response_text = cls.generate_grounded_response(user_message, context_lines, citations, effective_site)

        # Save Assistant Message
        assistant_msg = ChatMessage(
            conversation_id=conv.id,
            sender="ASSISTANT",
            message_text=response_text,
            citations_json=citations
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(conv)

        # 4. Log Audit Event
        AuditService.log_event(
            db=db,
            event_type="CHATBOT_QUERY",
            actor_id=current_user.id,
            site_id=effective_site,
            resource_type="ChatConversation",
            resource_id=str(conv.id),
            details={"query": user_message[:100], "citations_count": len(citations)}
        )

        return {
            "conversation_id": conv.id,
            "message": response_text,
            "citations": citations,
            "created_at": assistant_msg.created_at
        }

    @staticmethod
    def generate_grounded_response(
        query: str,
        context_lines: List[str],
        citations: List[Dict[str, Any]],
        site_id: Optional[str]
    ) -> str:
        q = query.lower()

        # Check for banned CCTV / Computer Vision queries
        if any(term in q for term in ["cctv", "camera", "computer vision", "ip camera", "rtsp", "ppe detection"]):
            return (
                "**Scope Clarification Notice:**\n"
                "In accordance with corporate governance boundaries, CCTV, IP camera feeds, and automated computer-vision PPE detection are strictly excluded from this Leadership Dashboard (and managed separately under Project SiteVision).\n\n"
                "All safety compliance figures and observations reported in this system are **100% human-audited and verified** by certified Safety Officers through on-site field checklists and logged incident reports.\n\n"
                "**Reference:** [Scope Governance | Pure Manual Safety Auditing]"
            )

        answer_parts: List[str] = []

        if "rank" in q or "leaderboard" in q or "top" in q or "score" in q:
            answer_parts.append("### 🏆 Authoritative 8-KRA Performance Status (Period 2026-W44)")
            rank_cites = [c for c in citations if c["type"] == "RANKING_ENGINE"]
            if rank_cites:
                for rc in rank_cites:
                    answer_parts.append(f"- **{rc['label']}**: {rc['details']}")
            else:
                answer_parts.append("Active sites are currently tracked under Methodology v1.0 with official 8-KRA weighting.")

        elif "progress" in q or "delay" in q or "concern" in q or "status" in q:
            answer_parts.append(f"### 📊 Operational & Weekly Synthesis {f'for {site_id}' if site_id else ''}")
            rep_cites = [c for c in citations if c["type"] == "WEEKLY_REPORT"]
            if rep_cites:
                for rc in rep_cites:
                    answer_parts.append(f"- **{rc['label']}**: {rc['details']}")
            for cl in context_lines[:3]:
                if "Weekly Report" in cl or "Site:" in cl:
                    answer_parts.append(f"> {cl}")

        elif "safety" in q or "incident" in q or "quality" in q:
            answer_parts.append("### 🛡️ Human-Audited Safety & Quality Overview")
            answer_parts.append("- **Verification Standard**: 100% manual audits, daily tool-box talks, and verified field inspections.")
            safety_cites = [c for c in citations if c["type"] == "SAFETY_AUDIT"]
            for sc in safety_cites:
                answer_parts.append(f"- **{sc['label']}**: {sc['details']}")

        else:
            answer_parts.append(f"### 📋 Construction Intelligence Response")
            answer_parts.append("Based on authoritative database records and approved engineering documents:")
            for cl in context_lines[:4]:
                answer_parts.append(f"- {cl}")

        # Add explicit citations footer
        answer_parts.append("\n---\n**Authoritative Source Citations:**")
        for i, cite in enumerate(citations[:4], 1):
            answer_parts.append(f"{i}. `[{cite['type']}]` **{cite['label']}** — *{cite['details']}*")

        return "\n\n".join(answer_parts)
