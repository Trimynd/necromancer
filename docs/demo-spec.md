# 🎬 Demo Spec: what the user sees, screen by screen

> Companion to [flow.md](flow.md). This file defines **every screen, every chart and every data field** we show in the final demo.
> Priority tags: 🟥 **MUST** (the demo fails without it) · 🟨 **SHOULD** (build if on time) · 🟦 **STRETCH** (only if everything else is done)

---

## 🗺️ The 5 screens

```mermaid
flowchart LR
    S0["🏠 0. Pitch"]:::s --> S1["❓ 1. Intake"]:::s --> S2["🧬 2. Team Assembly"]:::s --> S3["🔄 3. Live Research"]:::s --> S4["📊 4. Report"]:::r
    classDef s fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef r fill:#5f3a1d,stroke:#d99a4a,color:#fff
```

| Screen | User does | User sees | Time in demo |
|---|---|---|---|
| 🏠 0. Pitch | Types and/or uploads documents, confirms the mode | Text box · upload area · 4 mode cards · sample chips | 10s |
| ❓ 1. Intake | Confirms what was learned, answers the missing questions | "What I learned" card · mode core questions + AI follow-ups | 30s |
| 🧬 2. Team Assembly | Watches | Gemma inventing the agent team | 15s |
| 🔄 3. Live Research | Watches | Agents working in parallel, live log, then 😈 devil's advocate | 30–60s |
| 📊 4. Report | Explores, drags sliders | Verdict + riskiest assumption + 10 more sections | 60s+ |

---

## 🏠 Screen 0: Pitch 🟥

```
┌──────────────────────────────────────────────────────────┐
│                    🧠  <Project Name>                     │
│                  From idea to afterlife.                  │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Describe your business or idea…                      │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│    📎 Drop a company profile, pitch deck or sales sheet   │
│  │ PDF · CSV · Excel · image   🔒 never stored          │ │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                                           │
│  What's your situation?                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 🌱       │ │ 📈       │ │🚑 ✓      │ │ 🧟       │          │
│  │ Launch  │ │ Grow    │ │ Rescue  │ │ Revive  │          │
│  │ new idea│ │ working │ │declining│ │ shut    │          │
│  │         │ │ company │ │         │ │ down    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│   ↑ "Sounds like sales are declining: Rescue selected"    │
│                                                           │
│  Samples: [🍱 Tiffin] [📚 Coaching] [📱 Phone shop] [🛒 Grocery app] │
│                                                           │
│                      [ Analyze → ]                        │
└──────────────────────────────────────────────────────────┘
```

- **4 mode cards** 🟥: the AI preselects one from the pitch or document; one click to change.
- **Upload area** 🟥: PDF + CSV/Excel (must) · images (should) · DOCX/PPTX (stretch). Max 3 files, 10 pages, 5 MB each.
- **Sample chips**: one per mode, loading the demo company (pitch + documents). They double as our **demo safety net** (saved runs).
- Validation: a pitch of at least 20 characters **or** at least one file.

---

## ❓ Screen 1: Intake 🟥

> 🔄 **Questions depend on the mode.** Below is the 🌱 Launch version. For 📈 Grow · 🚑 Rescue · 🧟 Revive core questions, adaptive playbooks and the phone shop example, see [modes.md](modes.md).

### 📄 "What I learned" card 🟥 (shown first if documents were uploaded)

```
┌──────────────────────────────────────────────────────────┐
│  📄 From "CompanyProfile.pdf" + "sales.csv" I learned:    │
│                                                           │
│  ✓ Mobile phone retail · 2 shops, Pune            p.1     │
│  ✓ Brands: Xiaomi, Samsung, Realme                p.1     │
│  ✓ 12 months of sales: ₹18L → ₹9L          sales.csv ✔ exact │
│  ⚠ Team: 6 staff                 p.1 · from document, please check │
│  ? Cash in bank: not found                                │
│                                                           │
│  → Mode: 🚑 Rescue        [ ✏️ Edit ]  [ Looks right → ]   │
└──────────────────────────────────────────────────────────┘
```

- Every field shows **where it came from** (page or file) and a ✓/⚠/? state
- Monthly numbers from CSV/Excel show **"exact"** (read by code); numbers from a PDF show **"please check"**
- Fields found here are **skipped** in the questions below; `?` fields become questions

The AI reads the pitch and documents first, **pre-fills whatever it can** ("Location: Pune ✓"), and asks only for the rest.

```
┌──────────────────────────────────────────────────────────┐
│  A few questions before our agents start digging  (3/6)   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                           │
│  💵 What's your starting budget?                          │
│  ( ) < ₹5L   (•) ₹5–25L   ( ) ₹25L–1Cr   ( ) > ₹1Cr        │
│                                                           │
│  📍 Location / target market        [ Pune ✓ from pitch ] │
│                                                           │
│                       [ ← Back ]  [ Next → ]              │
└──────────────────────────────────────────────────────────┘
```

| # | Question | Input type |
|---|---|---|
| 1 | 💵 Starting budget | Single choice (4 ranges) |
| 2 | 📍 Location / target market | Text (pre-filled from pitch if found) |
| 3 | 👥 Team size & key skills | Number + multi-select chips (Tech, Sales, Ops, Finance, Domain) |
| 4 | ⏱️ Time to launch | Single choice: < 3 mo · 3–6 mo · 6–12 mo · 12+ mo |
| 5 | 🏗️ What exists already | Checkboxes: Nothing yet · Prototype · Paying users · Workspace · Partners |
| 6 | 🏷️ Price you'll charge + expected monthly running cost | Two number inputs (₹), with "Not sure, let AI estimate" toggle |
| 7–8 | 🤖 AI follow-ups (🟨 SHOULD) | Free text, max 2, generated from the pitch |

**End of intake → Profile summary card** (editable) → **[ Start research → ]**

```
📋 Your Business Profile
Tiffin subscriptions for students · Pune · ₹5–25L · 3 people (Tech, Ops)
Launch in 3–6 mo · Nothing built yet · ₹2,500/mo price · ₹1.5L/mo cost
                                   [ ✏️ Edit ]  [ Start research → ]
```

---

## 🧬 Screen 2: Team Assembly 🟥 (wow moment #1)

Gemma's Role Maker reads the profile and **invents the team live**. Cards appear one by one.

```
┌──────────────────────────────────────────────────────────┐
│  🧬 Gemma is assembling your research team…               │
│                                                           │
│  "Food business + student market + Pune → I need          │
│   logistics, pricing, local competition and FSSAI."       │
│                                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 🚚 Delivery   │ │ 🎓 Student    │ │ 🛡️ FSSAI      │ …    │
│  │ Logistics    │ │ Pricing      │ │ Compliance   │       │
│  │ Expert       │ │ Analyst      │ │ Checker      │       │
│  │──────────────│ │──────────────│ │──────────────│       │
│  │ Mission: map │ │ Mission: what│ │ Mission:     │       │
│  │ delivery cost│ │ will students│ │ licences &   │       │
│  │ & rivals     │ │ pay?         │ │ food safety  │       │
│  │ Covers: ⚔️💰  │ │ Covers: 📈🎯  │ │ Covers: ⚠️    │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
└──────────────────────────────────────────────────────────┘
```

Each agent card shows:
- **Emoji + name + role**, all invented by Gemma
- **Mission**: one line
- **Covers**: which report sections this agent feeds (⚔️ Competitors · 📈 Market · 💰 Investment · 🎯 ROI · ⚠️ Risks)
- 🟨 Gemma's one-line **reasoning** for building this team (shown at top)

---

## 🔄 Screen 3: Live Research 🟥

Same cards, now working. Each card shows its live status; a shared feed shows what's happening.

```
┌──────────────────────────────────────────────────────────┐
│  🔄 Researching… 2 of 4 agents done        ━━━━━━━━━░░ 70% │
│                                                           │
│  🚚 Logistics    ✅ Done      · 7 sources                  │
│  🎓 Pricing      🔍 Searching "student meal budget pune"   │
│  🛡️ FSSAI        📖 Reading fssai.gov.in…                  │
│  🏪 Competitors  ✅ Done      · 9 sources                  │
│                                                           │
│  ── Live feed ─────────────────────────────────────────   │
│  12:01:04  🏪 Found 6 competitors incl. Mealpe, Tiffin Wala │
│  12:01:09  🚚 Avg last-mile cost in Pune: ₹35–50/order     │
│  12:01:12  🛡️ FSSAI basic registration required < ₹12L     │
└──────────────────────────────────────────────────────────┘
```

- Status states per agent: ⏳ Queued → 🔍 Searching → 📖 Reading → 🧠 Analyzing → ✅ Done (❌ Failed shows a retry button)
- Source counter per agent
- When all agents are done: **"😈 Devil's Advocate is attacking your plan…"** (red card, ~5s)
- Final step: **"🔗 Gemma is merging findings…"** before the report opens

---

## 📊 Screen 4: The Report

Single scrolling page, sticky side nav.

```
┌───────────┬──────────────────────────────────────────────┐
│ 🎯 Verdict │  🟡 PIVOT · Viability 64/100                 │
│ 🧪 Assumpt.│  "Strong demand, but margins are thin at     │
│ 😈 Against │   ₹2,500. Viable if you add corporate        │
│ 📐 Scores  │   tiffins."                                  │
│ ✅ Pros/Con│                                              │
│ ⚔️ Compet. │  ┌────────────────────────────────────────┐  │
│ 📈 Market  │  │ 🧪 RISKIEST ASSUMPTION                  │  │
│ 💰 Invest. │  │ Students will pay ₹2,500/mo upfront.   │  │
│ 📉 ROI     │  │ Test it: 2-week pre-order page, 50     │  │
│ ⚠️ Risks   │  │ sign-ups = pass.                        │  │
│ 📋 Launch  │  └────────────────────────────────────────┘  │
│ 🚀 Next    │                                              │
│ 🔗 Sources │  … sections below …                          │
└───────────┴──────────────────────────────────────────────┘
```

### 4.1 🎯 Verdict (hero) 🟥

| Element | Visual |
|---|---|
| Viability score 0–100 | **Radial gauge**, coloured: 0–39 🔴 · 40–69 🟡 · 70–100 🟢 |
| Verdict label | Badge: 🟢 **GO** · 🟡 **PIVOT** · 🔴 **NO-GO** |
| One-line summary | Big text under the gauge |
| Top 3 reasons | 3 bullet chips |
| Confidence | Low / Medium / High, based on how many sources the agents found |

### 4.1a 🧪 Riskiest assumption 🟥 (wow moment #3)

The single thing the whole plan depends on that nobody has tested. Picked by the devil's advocate from every agent's `core_assumption`.

| Element | Example |
|---|---|
| The assumption | *"Students will pay ₹2,500/month upfront."* |
| Why it matters | *"Every ROI scenario breaks if the price drops below ₹1,900."* |
| How to test it cheaply | *"2-week pre-order landing page in Viman Nagar hostels. 50 paid sign-ups = pass."* |
| Pass / fail signal | One line |

Visual: a highlighted card directly under the verdict. **Next steps day 1 = run this test.**

### 4.1b 😈 Strongest argument against you 🟥

The devil's advocate attack, shown as a red-bordered card. In 🌱 Launch it's framed as a **☠️ pre-mortem**: *"It's 12 months from now and you're dead. Here's why."* (other modes: see [modes.md](modes.md)).
- **The attack:** 2–3 sentences, e.g. *"Swiggy can add a student subscription in a week and undercut you."*
- **Does the plan survive?** ✅ Survives / ⚠️ Survives with changes / ❌ Doesn't survive, plus a one-line reason
- **What would make it survive:** one line

### 4.2 📐 Score breakdown 🟥

**Horizontal bar chart**, one bar per dimension (0–10), with a one-line reason on hover:

| Dimension | What it measures | Weight |
|---|---|---|
| 📈 Market demand | Is there real need + growth? | 25% |
| 💰 Financial viability | Margins, break-even, runway, LTV:CAC | 25% |
| ⚔️ Competition | Higher score = less crowded | 15% |
| 👥 Execution fit | Does the team/budget match the idea? | 15% |
| 🛡️ Regulatory ease | Higher score = fewer legal hurdles | 10% |
| ⏰ Timing | Is now a good moment? | 10% |

> Viability score = Σ (score × weight) × 10. **Weights fixed in code, not by the AI.**
> Verdict: ≥ 70 🟢 GO · 40–69 🟡 PIVOT · < 40 🔴 NO-GO. If the devil's advocate says ❌ doesn't survive, the verdict is capped at 🟡 PIVOT.

### 4.3 ✅❌ Pros / Cons 🟥

Two columns. Each item has an **impact tag** (High / Medium / Low) and a **🔗 source link** when it came from research.

```
✅ PROS                              ❌ CONS
• 40k+ students in Viman Nagar  🔴H  • Margins < 15% at ₹2,500  🔴H
  🔗 source                           🔗 source
• Low capex: cloud kitchen      🟡M  • 6 funded rivals           🟡M
```

### 4.4 ⚔️ Competitor analysis 🟥

**a) Competitor table** 🟥

| Name | What they do | Pricing | Funding | Strength | Weakness | Threat |
|---|---|---|---|---|---|---|
| Example Co | Student tiffins | ₹2,800/mo | Seed ₹2Cr | Brand | Slow delivery | 🔴 High |

**b) Positioning map** 🟨: **scatter plot**
- X axis: Price (low → high) · Y axis: Market presence (small → large)
- Each competitor is a dot; **our idea is a highlighted star ⭐**
- Shows the "empty space" we could own

### 4.5 📈 Market analysis 🟥

| Element | Visual | Priority |
|---|---|---|
| TAM / SAM / SOM | **3 nested circles** (or 3 stacked bars) with ₹ values + source | 🟥 |
| Market growth | **Line chart**: market size by year + CAGR % label | 🟨 |
| Target customer | Persona card: who, age, income, pain point, willingness to pay | 🟥 |
| Key trends | 3–5 trend chips with ↗️/↘️ arrows + source | 🟨 |

### 4.6 💰 Investment requirements 🟥

| Element | Visual |
|---|---|
| One-time startup cost | **Horizontal bar chart** by item (kitchen setup, licences, marketing launch, tech…) + total |
| Monthly running cost | **Stacked bar** (rent, salaries, ingredients, delivery, marketing) |
| Runway | **Progress bar**: "Your ₹15L budget lasts **9 months** at this burn" |
| Funding route | Recommendation card: Bootstrap / Angel / Seed VC / Loan, with why |

### 4.7 📉 ROI projection 🟥 (wow moment #2)

**Line chart, 24 months**: cumulative profit/loss.
- 3 lines: 🔴 Pessimistic · 🟡 Base · 🟢 Optimistic
- Horizontal line at ₹0, **break-even point marked** on each line
- **KPI tiles** above the chart: Break-even month · ROI at 12 mo · ROI at 24 mo · Peak cash needed · **LTV:CAC** · **CAC payback (months)**
- LTV:CAC tile colour: ≥ 3 🟢 healthy · 1–3 🟡 thin · < 1 🔴 losing money on every customer

**🎚️ Live sliders** (🟥 MUST: this is the demo moment):

| Slider | Default comes from |
|---|---|
| Price per customer (₹/mo) | Intake Q6 or AI estimate |
| New customers per month | AI estimate from market research |
| Monthly growth % | AI estimate |
| Churn % | AI estimate |
| Fixed monthly cost (₹) | Intake Q6 or AI estimate |
| CAC: cost to acquire one customer (₹) | AI estimate from research |

Dragging a slider **recalculates the chart, KPIs and verdict colour instantly in the browser**. No AI call.

**The maths (plain code, never the AI):**
```
customers[m]  = customers[m-1] × (1 + growth) × (1 − churn) + new_per_month
revenue[m]    = customers[m] × price
cost[m]       = fixed_cost + customers[m] × variable_cost_per_customer
cumulative[m] = −startup_cost + Σ (revenue − cost)
break_even    = first m where cumulative[m] ≥ 0
ROI@24        = cumulative[24] / startup_cost
scenarios     = growth × 0.5 (pessimistic) · × 1 (base) · × 1.5 (optimistic)

margin        = price − variable_cost_per_customer        (per customer per month)
LTV           = margin ÷ churn                            (lifetime profit per customer)
LTV:CAC       = LTV ÷ CAC
CAC payback   = CAC ÷ margin                              (months to earn back acquisition cost)
```

Below the chart: **"Assumptions used"** box listing every number and where it came from (🔗 source or "AI estimate").

### 4.8 ⚠️ Risks & mitigations 🟨

| Risk | Category | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Ingredient price spikes | 🌍 External | 🟡 Med | 🔴 High | Fixed-price supplier contracts |

🟦 STRETCH: show it as a **2×2 risk matrix** (likelihood × impact).

### 4.8b 📋 Before you launch 🟥

A checklist of licences, registrations and approvals the business needs **before** it can legally operate. Each item: name · who issues it · rough cost · rough time · 🔗 source.

```
📋 BEFORE YOU LAUNCH
☐ FSSAI basic registration      · FSSAI      · ₹100/yr  · ~7 days   🔗
☐ GST registration (> ₹20L)     · GST portal · free     · ~7 days   🔗
☐ Shop & Establishment licence  · PMC Pune   · ~₹1,000  · ~15 days  🔗
```

Cost and time from this list are added to **Investment → one-time costs** and to the **launch timeline**.

### 4.9 🚀 Recommendations & next steps 🟥

- **Final AI verdict paragraph**: what to do and why
- **30 / 60 / 90 day plan**: 3 columns of action items. **Day-30 column always starts with testing the riskiest assumption.**
- **Suggested MVP features** 🟨: what to build first

### 4.10 🔗 Sources 🟥

Every link the agents used, **grouped by agent**. This is what makes the report credible.

Each source carries a badge for **how trustworthy it is**:
- 🔌 **Official data**: from a connector (Google Places, SEC EDGAR, data.gov.in, stock API)
- 🌐 **Web**: from a search result
- 🤖 **Estimate**: AI reasoning with no source; always shown as a range

The same badge appears next to numbers in the competitor table, market section and ROI assumptions. In the competitor table, rating, review count and distance come straight from Google Places.

### 🟦 Stretch extras
- 📄 Export report as PDF
- 🔗 Shareable report link
- 🔁 "What if?": change one intake answer and re-run

---

## 📦 Data contract: what the backend returns

Frontend builds against this shape on day zero (fake data first).

```jsonc
{
  "mode": "rescue",                         // launch | grow | rescue | revive

  "document_context": {
    "files": [ { "name": "CompanyProfile.pdf", "pages": 1 }, { "name": "sales.csv", "rows": 12 } ],
    "summary": "Two-store mobile retailer in Pune…",
    "extracted": { "location": { "value": "Pune", "from": "CompanyProfile.pdf p.1", "state": "found" } },
    "metrics_table": [ { "month": "2024-10", "revenue": 1800000, "exact": true } ],
    "missing": ["cash_in_bank", "what_changed"],
    "suggested_mode": "rescue"
  },

  "profile": { "pitch": "...", "budget": "5-25L", "location": "Pune", "team_size": 3,
               "skills": ["tech","ops"], "launch": "3-6mo", "existing": [], "price": 2500, "monthly_cost": 150000 },

  "team": {
    "reasoning": "Food + students + Pune → logistics, pricing, local rivals, FSSAI",
    "agents": [ { "id": "logistics", "emoji": "🚚", "name": "Delivery Logistics Expert",
                  "mission": "...", "covers": ["competitors","investment"] } ]
  },

  // each agent's raw output (one per agent, before synthesis)
  // shape = the shared thinking checklist in modes.md
  "agent_findings": [ { "agent_id": "logistics", "findings": "...", "core_assumption": "...",
                        "evidence_for": [], "evidence_against": [],
                        "risks": [ { "risk": "...", "category": "external", "countermeasure": "..." } ],
                        "sources": [ { "title": "...", "url": "..." } ] } ],

  "report": {
    "verdict":   { "score": 64, "label": "PIVOT", "summary": "...", "reasons": ["...","...","..."], "confidence": "medium" },
    "riskiest_assumption": { "assumption": "...", "why_it_matters": "...", "how_to_test": "...", "pass_signal": "..." },
    "devils_advocate": { "attack": "...", "survives": "with_changes", "reason": "...", "fix": "..." },
    "scores":    [ { "dimension": "market_demand", "score": 8, "reason": "..." } ],
    "pros":      [ { "point": "...", "impact": "high", "source": "https://..." } ],
    "cons":      [ { "point": "...", "impact": "high", "source": "https://..." } ],
    "competitors": [ { "name": "...", "what": "...", "pricing": "...", "funding": "...", "strength": "...",
                       "weakness": "...", "threat": "high", "price_level": 3, "presence": 4, "url": "..." } ],
    "market":    { "tam": { "value": 12000, "unit": "₹Cr", "source": "..." }, "sam": {}, "som": {},
                   "cagr": 18, "growth": [ { "year": 2024, "value": 9000 } ],
                   "persona": { "who": "...", "age": "18-24", "pain": "...", "willingness_to_pay": "..." },
                   "trends": [ { "trend": "...", "direction": "up", "source": "..." } ] },
    "investment": { "one_time": [ { "item": "Kitchen setup", "amount": 400000 } ],
                    "monthly":  [ { "item": "Rent", "amount": 40000 } ],
                    "funding_route": { "type": "bootstrap", "why": "..." } },
    "roi_assumptions": { "price": 2500, "new_per_month": 60, "growth": 0.08, "churn": 0.05,
                         "fixed_cost": 150000, "variable_cost_per_customer": 1600, "startup_cost": 800000, "cac": 1200,
                         "sources": { "new_per_month": "AI estimate", "price": "user" } },
    "risks":     [ { "risk": "...", "category": "external", "likelihood": "medium", "impact": "high", "mitigation": "..." } ],
    "prerequisites": [ { "item": "FSSAI registration", "issuer": "FSSAI", "cost": 100, "days": 7, "source": "..." } ],
    "next_steps": { "d30": ["..."], "d60": ["..."], "d90": ["..."] },
    "mvp_features": ["..."],
    "sources":   [ { "title": "...", "url": "...", "agent_id": "logistics",
                     "type": "connector",          // connector | web | estimate
                     "connector": "google_places" } ]
  }
}
```

> **Rule:** the backend sends assumptions; the **frontend computes runway, break-even, ROI, scenarios, LTV:CAC and the viability score**. That keeps the sliders instant and the maths honest.

### Live events (Screen 2 + 3)

| Event | Payload | Drives |
|---|---|---|
| `document_parsed` | `document_context` object | "What I learned" card |
| `team` | `team` object | Screen 2 cards |
| `agent_status` | `{ id, status, detail }` | Card status lines |
| `agent_log` | `{ id, message, time }` | Live feed |
| `agent_done` | `{ id, source_count }` | ✅ + counter |
| `devils_advocate` | none | "😈 Attacking your plan…" card |
| `synthesizing` | none | "Merging findings…" |
| `report` | `report` object | Screen 4 |

---

## 📈 Chart list (for the frontend dev)

| # | Chart | Type | Section | Priority |
|---|---|---|---|---|
| 1 | Viability score | Radial gauge | 🎯 Verdict | 🟥 |
| 2 | Score breakdown | Horizontal bars | 📐 Scores | 🟥 |
| 3 | ROI projection (3 scenarios + sliders) + KPI tiles incl. LTV:CAC | Line chart + tiles | 📉 ROI | 🟥 |
| 4 | One-time cost breakdown | Horizontal bars | 💰 Investment | 🟥 |
| 5 | Runway | Progress bar | 💰 Investment | 🟥 |
| 6 | TAM / SAM / SOM | Nested circles | 📈 Market | 🟥 |
| 7 | Monthly cost | Stacked bar | 💰 Investment | 🟨 |
| 8 | Competitor positioning | Scatter | ⚔️ Competitors | 🟨 |
| 9 | Market growth | Line chart | 📈 Market | 🟨 |
| 10 | Risk matrix | 2×2 grid | ⚠️ Risks | 🟦 |

One chart library for all of them (e.g. **Recharts**). Gauge and nested circles can be plain SVG.

---

## 🎤 Demo script (3 min)

**One mode live (🚑 Rescue), the other three as saved runs.**

| Time | Screen | What we say / do |
|---|---|---|
| 0:00 | 🏠 | *"From idea to afterlife: starting, growing, struggling or dead."* Point at the 4 mode cards. |
| 0:15 | 🏠→❓ | **Drop the phone shop PDF + sales CSV.** Rescue gets preselected; the "What I learned" card fills itself in. |
| 0:35 | ❓ | 1–2 adaptive questions live: *"Are fewer people coming in, or not buying?"* Point out the "why I'm asking". |
| 0:50 | 🧬 | **"Watch: Gemma decides what experts this business needs. No fixed team."** |
| 1:05 | 🔄 | Agents research live. "Every claim gets a source." Then 😈: *"Now we try to kill the turnaround."* |
| 1:30 | 📊 | **"Where you're failing"** chart with 🚩 markers → ranked root causes → **☝️ the ONE thing** |
| 1:45 | 📉 | **Drag "EMI partners 1 → 5" → runway and break-even change → verdict turns 🟢** |
| 1:50 | 🌱 | Launch sample (saved, or a judge's idea): ☠️ pre-mortem + 🧪 riskiest assumption |
| 2:10 | 📈 | Grow sample (saved): 🛡️ *"How a new entrant would destroy you"* |
| 2:30 | 🧟 | Revive sample (saved): ⚰️ autopsy + *"what's different now"* |
| 2:45 | 🔗 | *"Same pipeline, 4 situations, a different team every time. Researched, cited, calculated."* Close + repo link |

> 🛟 **Fallback:** every sample chip can replay its **saved run** with the same animations. If the live Rescue run is slow, switch to its saved run without comment.

---

## ✅ Build checklist

**🟥 MUST (by hour 4:30)**
- [ ] Screen 0 pitch + upload (PDF, CSV/Excel) + 4 mode cards with AI preselect + 4 sample chips
- [ ] "What I learned" card from documents
- [ ] Screen 1 intake: mode core questions + adaptive follow-ups for **all 4 modes** + profile card
- [ ] 4 signature sections: 🧪 riskiest assumption (Launch) · 🛡️ threats (Grow) · 📉 where you're failing + ☝️ ONE thing (Rescue) · ⚰️ autopsy (Revive)
- [ ] 4 sample companies (PDF profile, + CSV for Grow/Rescue) and **a saved run for each**
- [ ] Screen 2 team assembly cards
- [ ] Screen 3 live status + feed + devil's advocate card
- [ ] Report: Verdict gauge · **Riskiest assumption** · **Devil's advocate** · Score bars · Pros/Cons · Competitor table · TAM/SAM/SOM · Persona · Investment bars + runway · ROI chart + sliders + **LTV:CAC tiles** · **Before you launch** · Next steps · Sources
- [ ] Saved fallback run

**🟨 SHOULD**
- [ ] AI follow-up questions · Team reasoning line · Positioning scatter · Market growth line · Trends · Monthly cost stack · Risks table · MVP features

**🟦 STRETCH**
- [ ] Risk matrix · PDF export · Share link · What-if re-run
