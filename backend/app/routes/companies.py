from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import db

router = APIRouter(tags=["companies"])


class CreateCompanyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: str | None = None


class CreateConnectorRequest(BaseModel):
    type: str
    label: str
    config: dict = Field(default_factory=dict)


class FinancialRecordRequest(BaseModel):
    period: str = Field(description="e.g. '2026-09' for a month")
    revenue: float | None = None
    costs: float | None = None
    customers: int | None = None
    metrics: dict = Field(default_factory=dict)
    connector_id: str | None = None


async def _require_company(company_id: str) -> dict:
    company = await db.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company


@router.post("/api/companies")
async def create_company(req: CreateCompanyRequest) -> dict:
    return await db.create_company(req.name, req.url)


@router.get("/api/companies/{company_id}")
async def get_company(company_id: str) -> dict:
    """What a company can give: its profile, linked connectors, and financial history so far."""
    company = await _require_company(company_id)
    connectors = await db.list_connectors(company_id)
    records = await db.list_financial_records(company_id)
    return {**company, "connectors": connectors, "financial_records": records}


@router.post("/api/companies/{company_id}/connectors")
async def create_connector(company_id: str, req: CreateConnectorRequest) -> dict:
    await _require_company(company_id)
    if req.type not in db.CONNECTOR_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown connector type. Supported: {list(db.CONNECTOR_TYPES)}")
    return await db.create_connector(company_id, req.type, req.label, req.config)


@router.get("/api/companies/{company_id}/connectors")
async def list_connectors(company_id: str) -> list[dict]:
    await _require_company(company_id)
    return await db.list_connectors(company_id)


@router.post("/api/companies/{company_id}/financial-records")
async def add_financial_record(company_id: str, req: FinancialRecordRequest) -> dict:
    """Manual connector: the only one that actually ingests data today (see docs/db-and-connectors.md)."""
    await _require_company(company_id)
    return await db.add_financial_record(
        company_id, req.period, req.revenue, req.costs, req.customers, req.metrics,
        connector_id=req.connector_id, source="manual",
    )


@router.get("/api/companies/{company_id}/financial-records")
async def list_financial_records(company_id: str) -> list[dict]:
    await _require_company(company_id)
    return await db.list_financial_records(company_id)
