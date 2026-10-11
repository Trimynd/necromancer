"""JSON-schema tool definitions handed to Gemma for function calling.

Keyed by name so agents can request a subset via `AgentConfig.tools`.
"""

TOOL_REGISTRY: dict[str, dict] = {
    "scrape_wayback": {
        "name": "scrape_wayback",
        "description": "Fetch archived snapshots of a dead startup URL from the Wayback Machine.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Dead startup URL"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["url"],
        },
    },
    "rbi_lookup": {
        "name": "rbi_lookup",
        "description": "Check if a fintech idea complies with the RBI FREE-AI framework.",
        "parameters": {
            "type": "object",
            "properties": {
                "idea": {"type": "string", "description": "Short description of the product/idea"},
            },
            "required": ["idea"],
        },
    },
    "kyc_check": {
        "name": "kyc_check",
        "description": "Simulate a KYC/AML readiness check for a revived fintech product.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_spec": {
                    "type": "string",
                    "description": "Description of the product and how it handles user identity/payments",
                },
            },
            "required": ["product_spec"],
        },
    },
    "fraud_sim": {
        "name": "fraud_sim",
        "description": "Generate a sample fraud-risk profile and mitigation checklist for a fintech product.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_spec": {"type": "string"},
            },
            "required": ["product_spec"],
        },
    },
    "deploy_zombie_site": {
        "name": "deploy_zombie_site",
        "description": "Deploy a static landing page for the revived startup and get back a URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "html": {"type": "string"},
                "slug": {"type": "string", "description": "URL-safe identifier for the site"},
            },
            "required": ["html", "slug"],
        },
    },
}
