import pytest

from app.services.tool_executor import ToolExecutor


@pytest.mark.asyncio
async def test_rbi_lookup_flags_missing_consent():
    executor = ToolExecutor()
    result = await executor.execute({"name": "rbi_lookup", "args": {"idea": "instant credit scoring app"}})
    assert result["compliant"] is False
    assert any("consent" in v.lower() for v in result["violations"])


@pytest.mark.asyncio
async def test_kyc_check_detects_payment_handling():
    executor = ToolExecutor()
    result = await executor.execute({"name": "kyc_check", "args": {"product_spec": "a UPI wallet app"}})
    assert result["aml_screening_recommended"] is True


@pytest.mark.asyncio
async def test_unknown_tool_returns_error():
    executor = ToolExecutor()
    result = await executor.execute({"name": "nonexistent_tool", "args": {}})
    assert "error" in result


@pytest.mark.asyncio
async def test_bad_arguments_return_error_not_raise():
    executor = ToolExecutor()
    result = await executor.execute({"name": "rbi_lookup", "args": {"wrong_key": "x"}})
    assert "error" in result
