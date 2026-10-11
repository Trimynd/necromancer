"""Simulated KYC/AML readiness check — labeled as simulation, no real PII touched."""


async def kyc_check(product_spec: str) -> dict:
    lowered = product_spec.lower()
    handles_identity = any(k in lowered for k in ("kyc", "identity", "aadhaar", "pan", "signup", "onboarding"))
    handles_money = any(k in lowered for k in ("payment", "transfer", "wallet", "upi", "credit", "loan"))

    return {
        "simulation": True,
        "kyc_required": handles_identity,
        "aml_screening_recommended": handles_money,
        "pii_handling": "ENCRYPTED_AT_REST (recommended)",
        "consent_flow": "EXPLICIT (recommended)",
        "audit_trail": "IMMUTABLE_LOG (recommended)",
    }
