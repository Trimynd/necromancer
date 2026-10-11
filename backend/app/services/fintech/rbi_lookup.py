"""Rule-based RBI FREE-AI compliance checker.

This is a deliberately simple heuristic, not a real regulatory engine —
good enough to surface obvious gaps for a revived product's pitch.
"""

FREE_AI_PRINCIPLES = [
    "Trust is the Foundation",
    "People First",
    "Innovation over Restraint",
    "Fairness and Equity",
    "Accountability",
    "Understandable by Design",
]


async def rbi_lookup(idea: str) -> dict:
    lowered = idea.lower()
    violations = []
    if "credit" in lowered and "consent" not in lowered:
        violations.append("Digital Lending Guidelines: explicit consent required")
    if "payment" in lowered and "audit" not in lowered:
        violations.append("Payment systems: audit trail required")
    if ("ai" in lowered or "agent" in lowered) and "explain" not in lowered:
        violations.append("Understandable by Design: decisions must be explainable")

    return {
        "compliant": len(violations) == 0,
        "violations": violations,
        "applicable_principles": FREE_AI_PRINCIPLES,
    }
