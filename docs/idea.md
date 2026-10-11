```markdown
# Necromancer for Dead Startups — Full Implementation Plan

**Tagline:** We don't just remember dead fintech startups. We rehire them — and give them a compliance officer.

**Domain:** Fintech startup revival + general fintech problem solving
**Core Innovation:** Dynamic agent topology via Role Maker Agent (Gemma 4)
**Target:** Hackathon-winning agentic AI platform

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Gemma 4 API Integration Plan](#3-gemma-4-api-integration-plan)
4. [Role Maker Agent — Core Innovation](#4-role-maker-agent--core-innovation)
5. [Full Code Structure](#5-full-code-structure)
6. [Orchestrator Flow](#6-orchestrator-flow)
7. [Fintech-Specific Tools](#7-fintech-specific-tools)
8. [Blackboard (Shared Memory)](#8-blackboard-shared-memory)
9. [Full Flowchart](#9-full-flowchart)
10. [Gemma 4 Integration Details](#10-gemma-4-integration-details)
11. [24-Hour Build Plan](#11-24-hour-build-plan)
12. [Key Risks & Mitigations](#12-key-risks--mitigations)
13. [Demo Flow (3 Minutes)](#13-demo-flow-3-minutes)
14. [Pitch Line](#14-pitch-line)

---

## 1. Executive Summary

**Necromancer** is an agentic AI platform that resurrects dead fintech startups (and solves general fintech problems) by spawning a dynamic team of AI agents. Unlike fixed-role systems, it uses a **Role Maker Agent** that reads the problem statement and generates custom agent roles on the fly.

**Core innovation:** The agent topology is not hardcoded. Gemma 4 analyzes the problem, decides which specialists are needed, assigns them tools, and orchestrates their collaboration.

**One-liner:** Enter a dead startup URL. Gemma 4 exhumes its digital corpse, reconstructs the product, hires ghost employees, relaunches a tiny zombie MVP, and has the ghosts pitch you for investment.

**Tagline:** Y Combinator for the afterlife.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NECROMANCER PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌─────────────────────────────────────────────────────┐ │
│  │   USER UI    │───▶│              ORCHESTRATOR (Gemma 4)                  │ │
│  │  (Next.js)   │◀───│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  └──────────────┘    │  │  Observer   │─▶│  Planner    │─▶│  Executor   │  │ │
│                      │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│                      │         │                │                │        │ │
│                      └─────────┼────────────────┼────────────────┼────────┘ │
│                                │                │                │          │
│                                ▼                ▼                ▼          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    ROLE MAKER AGENT (Gemma 4)                        │  │
│  │  • Reads problem statement / dead startup URL                        │  │
│  │  • Generates custom roles (CEO, CTO, CMO, Fraud Analyst, KYC Expert) │  │
│  │  • Assigns tools per role                                            │  │
│  │  • Defines communication topology                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                │                                           │
│              ┌─────────────────┼─────────────────┐                        │
│              ▼                 ▼                 ▼                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│  │  GHOST CEO    │  │  GHOST CTO    │  │ GHOST ANALYST │  ... N agents    │
│  │  (Strategy)   │  │  (Code)       │  │ (Fintech)     │                  │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                  │
│          │                  │                  │                          │
│          └──────────────────┼──────────────────┘                          │
│                             ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     SHARED BLACKBOARD (Redis/Postgres)               │  │
│  │  • Agent messages  • Decisions  • Memory  • Tool results             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Gemma 4 API Integration Plan

### 3.1 Deployment Options

Gemma 4 supports native function calling for agentic workflows across all variants. Choose based on your hackathon constraints:

| Option | Best For | Setup |
|---|---|---|
| **Google AI Studio (Gemini API)** | Fastest start, no infra | `pip install google-genai` |
| **Vercel AI Gateway** | Next.js full-stack | `pnpm add ai` + API key |
| **Cloud Run + vLLM** | Self-hosted, production | Docker + gcloud CLI |
| **Ollama (local)** | Offline, free | `ollama pull gemma4` |

**Recommended for hackathon:** Google AI Studio API + Next.js frontend.

### 3.2 Gemma 4 API Client (Python)

```python
# backend/app/services/gemma_client.py

import os
from google import genai
from google.genai import types

class GemmaClient:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = "gemma-4-31b-it"
    
    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        tools: list = None,
        thinking: bool = True,
    ) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7,
            max_output_tokens=4096,
        )
        
        if tools:
            config.tools = tools
            config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(
                    mode="AUTO"  # Gemma 4 picks when to call tools
                )
            )
        
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=user_message,
            config=config,
        )
        
        return {
            "text": response.text,
            "function_calls": [
                {"name": fc.name, "args": fc.args}
                for fc in (response.function_calls or [])
            ],
            "thinking": getattr(response, "thought", None),
        }
```

### 3.3 Tool Definitions for Gemma 4

Gemma 4 uses native tokens for tool calling: `<|tool>`, `<|tool_call>`, `<|tool_response>`. Define tools as JSON schemas:

```python
# backend/app/services/tools.py

TOOLS = [
    {
        "name": "scrape_wayback",
        "description": "Fetch archived snapshots of a dead startup URL",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Dead startup URL"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["url"],
        },
    },
    {
        "name": "analyze_failure",
        "description": "Analyze why a startup failed using scraped data",
        "parameters": {
            "type": "object",
            "properties": {
                "startup_data": {"type": "object"},
            },
            "required": ["startup_data"],
        },
    },
    {
        "name": "spawn_agent",
        "description": "Create a new specialized agent with a role and tools",
        "parameters": {
            "type": "object",
            "properties": {
                "role_name": {"type": "string"},
                "system_prompt": {"type": "string"},
                "tools": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["role_name", "system_prompt"],
        },
    },
    {
        "name": "deploy_zombie_site",
        "description": "Deploy a static landing page for the revived startup",
        "parameters": {
            "type": "object",
            "properties": {
                "html": {"type": "string"},
                "subdomain": {"type": "string"},
            },
            "required": ["html"],
        },
    },
]
```

---

## 4. Role Maker Agent — Core Innovation

This is the first agent that runs. It receives the problem statement (dead startup URL or general fintech problem) and generates the entire agent topology.

### 4.1 How It Works

```
INPUT: "Revive PayStack (dead Nigerian fintech)" 
       OR "Build a fraud detection agent for UPI transactions"

                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│              ROLE MAKER AGENT (Gemma 4)              │
│                                                      │
│  Step 1: Classify problem domain                     │
│          → fintech_startup_revival | fintech_problem │
│                                                      │
│  Step 2: Extract required capabilities               │
│          → ["market_analysis", "code_gen",           │
│             "regulatory_compliance", "fraud_detect"] │
│                                                      │
│  Step 3: Generate roles                              │
│          → Ghost CEO, Ghost CTO, Compliance Officer, │
│            Fraud Analyst, UX Designer                │
│                                                      │
│  Step 4: Assign tools per role                       │
│          → CEO: [pitch_deck, market_data]            │
│            CTO: [code_interpreter, deploy]           │
│            Compliance: [rbi_lookup, aml_check]       │
│                                                      │
│  Step 5: Define topology                             │
│          → Star (CEO as hub) or Mesh (peer review)   │
│                                                      │
│  Step 6: Output AgentManifest (JSON)                 │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
        AgentManifest → Orchestrator spawns agents
```

### 4.2 Role Maker System Prompt

```python
# backend/app/agents/role_maker.py

ROLE_MAKER_PROMPT = """
You are the Role Maker for Necromancer, an agentic fintech platform.

Your job: Given a problem statement, design the optimal team of AI agents.

RULES:
1. Generate 3-7 agents maximum. Fewer is better.
2. Each agent must have a clear, non-overlapping role.
3. For fintech problems, ALWAYS consider:
   - Regulatory compliance (RBI FREE-AI, KYC, AML)
   - Fraud detection / risk
   - User experience
   - Technical feasibility
4. Assign specific tools from the available tool registry.
5. Choose a topology: "star" (one hub), "mesh" (all peer), or "hierarchical".

OUTPUT FORMAT (strict JSON):
{
  "domain": "fintech_startup_revival" | "fintech_problem",
  "problem_summary": "...",
  "agents": [
    {
      "id": "ghost_ceo",
      "name": "Ghost CEO",
      "system_prompt": "You are the ghost of ...",
      "tools": ["pitch_deck", "market_analysis"],
      "temperature": 0.8,
      "priority": 1
    }
  ],
  "topology": "star",
  "hub_agent": "ghost_ceo",
  "shared_memory_keys": ["decisions", "failure_reasons", "pivot_ideas"]
}

Do NOT hallucinate private data. Only use public archives.
"""
```

### 4.3 Role Maker Implementation

```python
# backend/app/agents/role_maker.py

import json
from app.services.gemma_client import GemmaClient

class RoleMakerAgent:
    def __init__(self):
        self.gemma = GemmaClient()
    
    async def generate_manifest(
        self, 
        problem_statement: str,
        dead_startup_data: dict = None,
    ) -> dict:
        
        context = f"PROBLEM: {problem_statement}"
        if dead_startup_data:
            context += f"\n\nDEAD STARTUP DATA:\n{json.dumps(dead_startup_data, indent=2)}"
        
        response = await self.gemma.generate(
            system_prompt=ROLE_MAKER_PROMPT,
            user_message=context,
            thinking=True,
        )
        
        # Parse JSON from response
        manifest = self._extract_json(response["text"])
        manifest = self._validate_manifest(manifest)
        
        return manifest
    
    def _extract_json(self, text: str) -> dict:
        """Extract JSON block from Gemma response."""
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    
    def _validate_manifest(self, manifest: dict) -> dict:
        """Ensure manifest has required fields."""
        required = ["agents", "topology"]
        for field in required:
            if field not in manifest:
                raise ValueError(f"Manifest missing {field}")
        
        # Cap agents at 7
        if len(manifest["agents"]) > 7:
            manifest["agents"] = manifest["agents"][:7]
        
        return manifest
```

---

## 5. Full Code Structure

```
necromancer/
├── frontend/                          # Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx                   # Landing: URL input
│   │   ├── revive/[id]/page.tsx       # Live resurrection view
│   │   ├── problem/page.tsx           # Fintech problem solver
│   │   └── api/
│   │       ├── revive/route.ts        # POST: start resurrection
│   │       └── stream/route.ts        # SSE: agent updates
│   ├── components/
│   │   ├── AgentCard.tsx              # Shows agent role + status
│   │   ├── Blackboard.tsx             # Live agent messages
│   │   ├── ManifestViewer.tsx         # Role Maker output
│   │   ├── AutopsyReport.tsx          # Cause of death analysis
│   │   └── ZombiePreview.tsx          # Generated landing page
│   ├── lib/
│   │   ├── api.ts                     # Backend client
│   │   └── sse.ts                     # SSE hook
│   └── package.json
│
├── backend/                           # FastAPI (Python 3.11+)
│   ├── app/
│   │   ├── main.py                    # FastAPI app + CORS
│   │   ├── config.py                  # Env vars, settings
│   │   │
│   │   ├── agents/                    # Agent definitions
│   │   │   ├── base_agent.py          # Abstract agent class
│   │   │   ├── role_maker.py          # ★ Role Maker Agent
│   │   │   ├── orchestrator.py        # Main loop
│   │   │   ├── ghost_ceo.py           # Example specialist
│   │   │   ├── ghost_cto.py
│   │   │   ├── ghost_analyst.py
│   │   │   └── registry.py            # Agent factory
│   │   │
│   │   ├── services/
│   │   │   ├── gemma_client.py        # ★ Gemma 4 API wrapper
│   │   │   ├── tools.py               # Tool definitions
│   │   │   ├── tool_executor.py       # Runs tool calls
│   │   │   ├── blackboard.py          # Shared memory (Redis)
│   │   │   ├── scraper.py             # Wayback/Common Crawl
│   │   │   ├── deployer.py            # Zombie site deployment
│   │   │   └── fintech/
│   │   │       ├── rbi_lookup.py      # RBI FREE-AI checker
│   │   │       ├── kyc_validator.py   # KYC/AML simulation
│   │   │       └── fraud_sim.py       # Fraud pattern generator
│   │   │
│   │   ├── models/
│   │   │   ├── manifest.py            # Pydantic: AgentManifest
│   │   │   ├── agent.py               # Pydantic: AgentState
│   │   │   └── blackboard.py          # Pydantic: Message
│   │   │
│   │   ├── routes/
│   │   │   ├── revive.py              # POST /api/revive
│   │   │   ├── problem.py             # POST /api/problem
│   │   │   ├── stream.py              # GET /api/stream/{id}
│   │   │   └── health.py
│   │   │
│   │   └── utils/
│   │       ├── json_parser.py
│   │       └── logger.py
│   │
│   ├── tests/
│   │   ├── test_role_maker.py
│   │   ├── test_orchestrator.py
│   │   └── test_tools.py
│   │
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml                 # Redis + Postgres + Backend
├── .env.example
└── README.md
```

### 5.1 Base Agent Class

```python
# backend/app/agents/base_agent.py

from abc import ABC, abstractmethod
from app.services.gemma_client import GemmaClient
from app.services.tool_executor import ToolExecutor
from app.services.blackboard import Blackboard

class BaseAgent(ABC):
    def __init__(self, config: dict, blackboard: Blackboard):
        self.id = config["id"]
        self.name = config["name"]
        self.system_prompt = config["system_prompt"]
        self.tools = config.get("tools", [])
        self.temperature = config.get("temperature", 0.7)
        self.blackboard = blackboard
        self.gemma = GemmaClient()
        self.tool_executor = ToolExecutor()
        self.memory = []
    
    async def run(self, task: str, context: dict = None) -> dict:
        """Main agent loop: Observe → Think → Act → Reflect."""
        
        # Observe: read blackboard
        board_state = await self.blackboard.read_relevant(self.id)
        
        # Build prompt
        full_prompt = self._build_prompt(task, board_state, context)
        
        # Think + Act
        response = await self.gemma.generate(
            system_prompt=self.system_prompt,
            user_message=full_prompt,
            tools=self._get_tool_schemas(),
        )
        
        # Execute tool calls
        tool_results = []
        for call in response.get("function_calls", []):
            result = await self.tool_executor.execute(call)
            tool_results.append(result)
            await self.blackboard.write(self.id, call, result)
        
        # Reflect
        final = await self._reflect(response["text"], tool_results)
        
        # Store memory
        self.memory.append({"task": task, "output": final})
        await self.blackboard.write(self.id, "output", final)
        
        return final
    
    async def _reflect(self, text: str, tool_results: list) -> str:
        """Self-critique step."""
        reflection_prompt = f"""
        You produced: {text}
        Tool results: {tool_results}
        
        Critique your output. Is it accurate? Any hallucinations?
        Provide the final corrected output.
        """
        resp = await self.gemma.generate(
            system_prompt="You are a critical reviewer.",
            user_message=reflection_prompt,
        )
        return resp["text"]
    
    def _build_prompt(self, task, board_state, context) -> str:
        parts = [f"TASK: {task}"]
        if board_state:
            parts.append(f"TEAM CONTEXT:\n{board_state}")
        if context:
            parts.append(f"CONTEXT:\n{context}")
        return "\n\n".join(parts)
    
    def _get_tool_schemas(self) -> list:
        from app.services.tools import TOOL_REGISTRY
        return [TOOL_REGISTRY[t] for t in self.tools if t in TOOL_REGISTRY]
```

---

## 6. Orchestrator Flow

```python
# backend/app/agents/orchestrator.py

from app.agents.role_maker import RoleMakerAgent
from app.agents.registry import AgentFactory
from app.services.blackboard import Blackboard
from app.services.scraper import StartupScraper

class Orchestrator:
    def __init__(self):
        self.role_maker = RoleMakerAgent()
        self.blackboard = Blackboard()
        self.scraper = StartupScraper()
    
    async def revive_startup(self, url: str, session_id: str):
        # Phase 1: Scrape dead startup
        await self.blackboard.emit(session_id, "status", "scraping")
        startup_data = await self.scraper.scrape(url)
        
        # Phase 2: Role Maker generates team
        await self.blackboard.emit(session_id, "status", "role_making")
        manifest = await self.role_maker.generate_manifest(
            problem_statement=f"Revive dead fintech startup: {url}",
            dead_startup_data=startup_data,
        )
        await self.blackboard.emit(session_id, "manifest", manifest)
        
        # Phase 3: Spawn agents
        agents = AgentFactory.create_team(manifest, self.blackboard)
        
        # Phase 4: Run rounds
        hub = self._find_hub(agents, manifest)
        for round_num in range(3):
            await self.blackboard.emit(session_id, "round", round_num)
            
            # Parallel: all agents observe + think
            tasks = [a.run("Analyze and propose action", startup_data) 
                     for a in agents]
            results = await asyncio.gather(*tasks)
            
            # Hub synthesizes
            synthesis = await hub.run("Synthesize team outputs", {
                "team_outputs": results,
                "round": round_num,
            })
            
            # Check if CEO says "ready to pitch"
            if "pitch" in synthesis.lower():
                break
        
        # Phase 5: Final pitch
        pitch = await hub.run("Deliver final pitch to user", {})
        await self.blackboard.emit(session_id, "pitch", pitch)
        
        return {"manifest": manifest, "pitch": pitch, "startup_data": startup_data}
    
    def _find_hub(self, agents, manifest):
        hub_id = manifest.get("hub_agent")
        return next((a for a in agents if a.id == hub_id), agents[0])
```

---

## 7. Fintech-Specific Tools

```python
# backend/app/services/fintech/rbi_lookup.py

class RBILookupTool:
    """Check if a fintech idea complies with RBI FREE-AI framework."""
    
    FREE_AI_PRINCIPLES = [
        "Trust is the Foundation",
        "People First",
        "Innovation over Restraint",
        "Fairness and Equity",
        "Accountability",
        "Understandable by Design",
    ]
    
    async def execute(self, idea: str) -> dict:
        # In production: query RBI circulars, FREE-AI report
        # For hackathon: rule-based checker
        violations = []
        if "credit" in idea.lower() and "consent" not in idea.lower():
            violations.append("Digital Lending Guidelines: consent required")
        if "payment" in idea.lower() and "audit" not in idea.lower():
            violations.append("Payment systems: audit trail required")
        
        return {
            "compliant": len(violations) == 0,
            "violations": violations,
            "applicable_principles": self.FREE_AI_PRINCIPLES,
        }
```

```python
# backend/app/services/fintech/kyc_validator.py

class KYCValidatorTool:
    """Simulate KYC/AML checks for a revived fintech product."""
    
    async def execute(self, product_spec: dict) -> dict:
        return {
            "kyc_required": True,
            "aml_screening": "PASS",
            "pii_handling": "ENCRYPTED",
            "consent_flow": "EXPLICIT",
            "audit_trail": "IMMUTABLE_LOG",
            "kya_ready": True,  # Know Your Agent readiness
        }
```

**Fintech regulatory context:** Banks are adopting "Know Your Agent" (KYA) frameworks for AI identity, authentication, and transaction limits. NPCI is developing a Unified Agentic Protocol for UPI payments with agent registries and predefined limits. The RBI FREE-AI framework provides seven guiding principles for responsible AI in finance.

---

## 8. Blackboard (Shared Memory)

```python
# backend/app/services/blackboard.py

import redis.asyncio as redis
import json

class Blackboard:
    def __init__(self):
        self.redis = redis.from_url("redis://localhost:6379")
    
    async def write(self, agent_id: str, key: str, value):
        await self.redis.hset(
            f"session:{self.session_id}:blackboard",
            f"{agent_id}:{key}",
            json.dumps(value),
        )
    
    async def read_relevant(self, agent_id: str) -> dict:
        all_data = await self.redis.hgetall(
            f"session:{self.session_id}:blackboard"
        )
        # Return everything EXCEPT this agent's own data
        return {
            k.decode(): json.loads(v) 
            for k, v in all_data.items() 
            if not k.decode().startswith(agent_id)
        }
    
    async def emit(self, session_id: str, event: str, data):
        """Push SSE event to frontend."""
        await self.redis.publish(
            f"session:{session_id}:events",
            json.dumps({"event": event, "data": data}),
        )
```

---

## 9. Full Flowchart

```
┌──────────────┐
│   USER       │
│  Enters URL  │
│  or Problem  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    FASTAPI /api/revive                        │
│  1. Validate input                                            │
│  2. Create session_id                                         │
│  3. Start background task                                     │
│  4. Return session_id + SSE endpoint                          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    SCRAPER SERVICE                            │
│  • Wayback CDX API → snapshots                                │
│  • GitHub API → repos                                         │
│  • HN Algolia → discussions                                   │
│  • Common Crawl → pages                                       │
│  Output: {name, tagline, product, tech_stack, failure_signals}│
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  ROLE MAKER AGENT (Gemma 4)                    │
│  Input: problem + scraped data                                │
│  Output: AgentManifest JSON                                   │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 1. Classify domain (startup_revival | fintech_problem)   │ │
│  │ 2. Extract capabilities needed                           │ │
│  │ 3. Generate 3-7 agent roles                              │ │
│  │ 4. Assign tools per role                                 │ │
│  │ 5. Choose topology (star | mesh | hierarchical)          │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    AGENT FACTORY                              │
│  For each agent in manifest:                                  │
│    • Instantiate BaseAgent subclass                           │
│    • Bind tools via ToolExecutor                              │
│    • Register with Blackboard                                 │
│    • Connect to Gemma 4 API                                   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR LOOP                          │
│                                                               │
│  ROUND 1: Discovery                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Ghost   │  │ Ghost   │  │Compliance│  │ Fraud   │         │
│  │ CEO     │  │ CTO     │  │ Officer │  │ Analyst │         │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘         │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
│                         ▼                                   │
│              ┌─────────────────────┐                        │
│              │   BLACKBOARD        │                        │
│              │  (Shared Memory)    │                        │
│              └──────────┬──────────┘                        │
│                         │                                   │
│  ROUND 2: Synthesis     │                                   │
│              ┌──────────▼──────────┐                        │
│              │   HUB AGENT (CEO)   │                        │
│              │  Reads all outputs  │                        │
│              │  Finds conflicts    │                        │
│              │  Resolves           │                        │
│              └──────────┬──────────┘                        │
│                         │                                   │
│  ROUND 3: Execution     │                                   │
│              ┌──────────▼──────────┐                        │
│              │  Parallel Actions   │                        │
│              │  • CTO: build MVP   │                        │
│              │  • CMO: write copy  │                        │
│              │  • Compliance: audit│                        │
│              └──────────┬──────────┘                        │
│                         │                                   │
│  ROUND 4: Pitch         │                                   │
│              ┌──────────▼──────────┐                        │
│              │  CEO delivers pitch │                        │
│              │  to user via SSE    │                        │
│              └─────────────────────┘                        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (SSE)                             │
│  • Agent cards appear live                                    │
│  • Blackboard messages stream                                 │
│  • Autopsy report renders                                     │
│  • Zombie landing page previews                               │
│  • User can intervene: "Invest 50 soul tokens"                │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Gemma 4 Integration Details

### 10.1 Model Selection

Gemma 4 comes in three variants:

| Variant | Parameters | Best For |
|---|---|---|
| Gemma 4 31B | 30.7B dense | Highest quality, Role Maker |
| Gemma 4 26B-A4B | 25.2B/3.8B active (MoE) | Cost-efficient specialists |
| Gemma 4 E2B | 5.1B total / 2.3B effective | Fast tool calls, on-device |

**Recommendation:** Use 31B for Role Maker + Orchestrator. Use 26B-A4B for specialist agents (cheaper, faster). Use E2B for simple tool-call parsing.

### 10.2 Thinking Mode

Gemma 4 has configurable thinking modes. Enable thinking for the Role Maker (complex reasoning) and disable for tool-call agents (speed).

```python
# Thinking ON for Role Maker
response = await gemma.generate(..., thinking=True)

# Thinking OFF for tool execution
response = await gemma.generate(..., thinking=False)
```

### 10.3 Native Tool Tokens

Gemma 4 uses dedicated tokens for tool management, simplifying prompt construction:

```
<|tool>              # Start tool definition
<|tool_call>         # Model requests tool
<tool_call|>         # End tool call
<|tool_response>     # Tool result
<tool_response|>     # End tool result
```

The KerasHub guide demonstrates using these tokens for function calling. The `gemma-agent` npm package handles this natively.

### 10.4 Backend ModelBackend Interface

For Node.js agents, implement the `ModelBackend` interface:

```typescript
// frontend/lib/gemma-backend.ts
import { Agent } from '@kessler/gemma-agent';

interface ModelBackend {
  generateRaw(prompt: string, options?: GenerateOptions): Promise<string>;
  countTokens(text: string): number;
  readonly contextLimit: number;
  abort(): void;
}
```

---

## 11. 24-Hour Build Plan

| Hours | Task | Owner |
|---|---|---|
| 0–2 | Setup: FastAPI + Next.js + Redis + Gemma API key | Full team |
| 2–5 | Role Maker agent + manifest schema | AI lead |
| 5–8 | Scraper (Wayback + HN) + fintech tools | Backend |
| 8–12 | BaseAgent + Orchestrator + Blackboard | Backend |
| 12–15 | Frontend: agent cards + SSE stream | Frontend |
| 15–18 | Specialist agents (CEO, CTO, Compliance) | AI lead |
| 18–21 | Zombie site deployer + pitch generation | Full team |
| 21–23 | Seed 3 dead fintech startups + polish | Full team |
| 23–24 | Demo rehearsal + fallback video | Full team |

---

## 12. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemma 4 API rate limits | Cache responses; use E2B for simple calls |
| Hallucinated startup data | Auditor agent cross-checks sources; label as simulation |
| Agent infinite loops | Max 10 iterations per agent (set in `gemma-agent` options) |
| SSE connection drops | Reconnect logic + poll fallback |
| Regulatory backlash | Label everything "simulation/parody"; use public data only |
| Role Maker produces bad roles | Validate manifest; fallback to hardcoded team |

---

## 13. Demo Flow (3 Minutes)

1. User enters a dead fintech startup URL (e.g., a defunct Nigerian neobank).
2. Gemma 4 orchestrator scrapes Wayback, GitHub, HN in real time.
3. **Autopsy Report** appears: what it was, why it died, recoverable assets.
4. **Role Maker Agent** generates a custom team: Ghost CEO, Ghost CTO, Compliance Officer, Fraud Analyst.
5. Agents debate live on the blackboard: revive, pivot, or shut down again.
6. Ghost CTO builds a **zombie MVP** (landing page + waitlist + API mock).
7. Compliance Officer runs RBI FREE-AI check and KYC simulation.
8. Ghost CEO pitches to the user and asks for "soul tokens."
9. User invests. Zombie startup deploys live at `/zombie/startup-name`.

---

## 14. Pitch Line

**"We don't just remember dead fintech