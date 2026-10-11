import pytest

from app.services import db


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db._conn.cache_clear()
    yield
    db._conn.cache_clear()


@pytest.mark.asyncio
async def test_create_and_get_company(fresh_db):
    company = await db.create_company("Phone Shop", url="https://example.com")
    fetched = await db.get_company(company["id"])
    assert fetched["name"] == "Phone Shop"
    assert fetched["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_unknown_connector_type_not_in_registry(fresh_db):
    assert "upi" in db.CONNECTOR_TYPES
    assert db.CONNECTOR_TYPES["manual"] == "active"
    assert db.CONNECTOR_TYPES["upi"] == "coming_soon"


@pytest.mark.asyncio
async def test_connector_and_financial_record_roundtrip(fresh_db):
    company = await db.create_company("Phone Shop")
    connector = await db.create_connector(company["id"], "manual", "Monthly sales CSV")
    assert connector["status"] == "active"

    await db.add_financial_record(company["id"], "2026-08", revenue=1800000, costs=1500000, connector_id=connector["id"])
    await db.add_financial_record(company["id"], "2026-09", revenue=900000, costs=1400000, connector_id=connector["id"])

    records = await db.list_financial_records(company["id"])
    assert [r["period"] for r in records] == ["2026-08", "2026-09"]
    assert records[1]["revenue"] == 900000

    connectors = await db.list_connectors(company["id"])
    assert connectors[0]["last_synced_at"] is not None


@pytest.mark.asyncio
async def test_save_session_insert_then_update(fresh_db):
    await db.save_session("s1", status="pending", question="why did it die?")
    first = await db.get_session("s1")
    assert first["status"] == "pending"

    await db.save_session("s1", status="done", question="why did it die?", verdict="REVIVE")
    second = await db.get_session("s1")
    assert second["status"] == "done"
    assert second["verdict"] == "REVIVE"
    assert second["created_at"] == first["created_at"]


@pytest.mark.asyncio
async def test_get_unknown_company_returns_none(fresh_db):
    assert await db.get_company("nonexistent") is None
