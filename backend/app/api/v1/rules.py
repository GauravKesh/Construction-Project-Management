import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.dependencies import get_audit_repo, get_rule_repo
from app.db.models.rule import Rule, AlertSeverity
from app.db.models.user import User, UserRole
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.rule_repo import RuleRepository
from app.gateway.auth import get_current_user
from app.gateway.rbac import require_roles
from app.processing.rule_engine import evaluate_operator
from app.schemas.common import PaginatedResponse, StatusMessage
from app.schemas.rule import (
    RuleCreate,
    RuleResponse,
    RuleTestRequest,
    RuleTestResult,
    RuleUpdate,
)

router = APIRouter(prefix="", tags=["Rules"])


@router.get("/rules", response_model=PaginatedResponse[RuleResponse])
async def list_rules(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    site_id: Optional[uuid.UUID] = None,
    sensor_type: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    rule_repo: RuleRepository = Depends(get_rule_repo),
):
    skip = (page - 1) * page_size
    rules = await rule_repo.list_rules(
        skip=skip,
        limit=page_size,
        site_id=site_id,
        sensor_type=sensor_type,
        is_enabled=is_enabled,
    )
    total = len(rules)
    pages = math.ceil(total / page_size) if total > 0 else 1
    return PaginatedResponse(items=rules, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/rules", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    req: RuleCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    rule_repo: RuleRepository = Depends(get_rule_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    rule = await rule_repo.create(**req.model_dump())
    await audit_repo.record(
        action="CREATE_RULE",
        entity_type="rule",
        entity_id=str(rule.id),
        details={"name": rule.name, "sensor_type": rule.sensor_type, "operator": rule.operator},
        user_id=current_user.id,
    )
    return rule


@router.get("/rules/{rule_id}", response_model=RuleResponse)
async def get_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    rule_repo: RuleRepository = Depends(get_rule_repo),
):
    rule = await rule_repo.get_by_id(rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule


@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    req: RuleUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    rule_repo: RuleRepository = Depends(get_rule_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    rule = await rule_repo.update(rule_id, **req.model_dump(exclude_unset=True))
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    await audit_repo.record(
        action="UPDATE_RULE",
        entity_type="rule",
        entity_id=str(rule_id),
        details=req.model_dump(exclude_unset=True),
        user_id=current_user.id,
    )
    return rule


@router.delete("/rules/{rule_id}", response_model=StatusMessage)
async def delete_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER])),
    rule_repo: RuleRepository = Depends(get_rule_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    success = await rule_repo.delete(rule_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    await audit_repo.record(
        action="DELETE_RULE",
        entity_type="rule",
        entity_id=str(rule_id),
        user_id=current_user.id,
    )
    return StatusMessage(status="ok", message="Rule deleted successfully")


@router.post("/rules/{rule_id}/toggle", response_model=RuleResponse)
async def toggle_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.SAFETY_OFFICER])),
    rule_repo: RuleRepository = Depends(get_rule_repo),
    audit_repo: AuditRepository = Depends(get_audit_repo),
):
    rule = await rule_repo.toggle(rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    await audit_repo.record(
        action="TOGGLE_RULE",
        entity_type="rule",
        entity_id=str(rule_id),
        details={"is_enabled": rule.is_enabled},
        user_id=current_user.id,
    )
    return rule


@router.post("/rules/test", response_model=RuleTestResult)
async def test_rule(
    req: RuleTestRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Dry run rule condition evaluator.
    """
    matched = evaluate_operator(
        op_str=req.operator,
        val=req.test_value,
        threshold1=req.threshold_val1,
        threshold2=req.threshold_val2,
    )
    msg = f"Value {req.test_value} {'MATCHED' if matched else 'DID NOT MATCH'} condition {req.operator} {req.threshold_val1}"
    if req.threshold_val2 is not None:
        msg += f" and {req.threshold_val2}"

    return RuleTestResult(
        matched=matched,
        operator=req.operator,
        threshold_val1=req.threshold_val1,
        threshold_val2=req.threshold_val2,
        test_value=req.test_value,
        message=msg,
    )
