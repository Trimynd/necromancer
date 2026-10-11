"""Generates a sample fraud-risk profile for a fintech product idea (illustrative, not a real model)."""

COMMON_PATTERNS = [
    "Account takeover via credential stuffing",
    "Synthetic identity onboarding",
    "Velocity abuse on new payment rails",
    "Mule-account layering",
]


async def fraud_sim(product_spec: str) -> dict:
    lowered = product_spec.lower()
    risk_level = "high" if any(k in lowered for k in ("payment", "transfer", "credit", "loan", "upi")) else "medium"

    return {
        "simulation": True,
        "risk_level": risk_level,
        "likely_patterns": COMMON_PATTERNS,
        "mitigations": [
            "Device + velocity fingerprinting on signup",
            "Step-up auth above risk thresholds",
            "Real-time transaction monitoring with human review queue",
        ],
    }
