from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from app.core.dependencies import get_alert_repo, get_audit_repo, get_incident_repo
from app.db.models.user import User
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.gateway.auth import get_current_user
from app.schemas.search import SearchResponse, SearchResultItem

router = APIRouter(prefix="", tags=["Search"])


@router.get("/search", response_model=SearchResponse)
async def unified_search(
    q: str = Query(..., min_length=1, description="Search query string"),
    type: Optional[str] = Query(None, description="incidents, alerts, or audit"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    incident_repo: IncidentRepository = Depends(get_incident_repo),
    alert_repo: AlertRepository = Depends(get_alert_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    results: List[SearchResultItem] = []
    types_to_search = [type.lower()] if type else ["incidents", "alerts", "audit"]

    # 1. Incidents full-text search
    if "incidents" in types_to_search:
        incidents = await incident_repo.search(search_text=q, limit=limit)
        for inc in incidents:
            results.append(
                SearchResultItem(
                    id=str(inc.id),
                    type="incident",
                    title=f"{inc.incident_number}: {inc.title}",
                    description=inc.description,
                    created_at=inc.created_at,
                    metadata={"status": inc.status.value, "severity": inc.severity.value},
                )
            )

    # 2. Alerts full-text search
    if "alerts" in types_to_search:
        alerts = await alert_repo.search(search_text=q, limit=limit)
        for a in alerts:
            results.append(
                SearchResultItem(
                    id=str(a.id),
                    type="alert",
                    title=f"Alert: {a.alert_type}",
                    description=a.message,
                    created_at=a.created_at,
                    metadata={"status": a.status.value, "severity": a.severity.value},
                )
            )

    # 3. Audit logs full-text search
    if "audit" in types_to_search:
        logs = await audit_repo.search(search_text=q, limit=limit)
        for l in logs:
            results.append(
                SearchResultItem(
                    id=str(l.id),
                    type="audit",
                    title=f"Audit: {l.action} on {l.entity_type}",
                    description=str(l.details),
                    created_at=l.created_at,
                    metadata={"entity_id": l.entity_id},
                )
            )

    return SearchResponse(
        query=q,
        total_results=len(results),
        results=results[:limit],
    )
