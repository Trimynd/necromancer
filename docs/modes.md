# 🔄 The 4 Modes: one pipeline, every stage of a company's life

> **"From idea to afterlife."** Whether you're starting, growing, struggling or dead, a custom team of AI agents tells you where you stand and what to do next.

| # | Mode | The user says | The core question | Verdict |
|---|---|---|---|---|
| 1 | 🌱 **Launch** | "I want to start X" | Should I build this? | 🟢 GO · 🟡 PIVOT · 🔴 NO-GO |
| 2 | 📈 **Grow** | "My company works, make it better" | Where can I grow, and what could kill me? | Top 3 levers + growth score + threat level |
| 3 | 🚑 **Rescue** | "My numbers are going down" | Why am I declining, and how do I fix it? | 🟢 RECOVERABLE · 🟡 RESTRUCTURE · 🔴 WIND DOWN |
| 4 | 🧟 **Revive** | "My company died, I want to restart it" | Why did it die, and what's different now? | 🟢 REVIVE · 🟡 REVIVE WITH PIVOT · 🔴 STAY DEAD |

📄 Pipeline overview: [flow.md](flow.md) · Screens & data: [demo-spec.md](demo-spec.md)

---

## 🧭 Picking the mode

**4 cards on the landing page + auto-preselect.** The AI reads the pitch and highlights the card it thinks fits, and the user confirms with one click.

> *"Sounds like your sales are declining. I've selected 🚑 Rescue."* [Change mode]

Safer on stage than pure auto-detect (no wrong guess), and still looks smart.

---

## 🔁 What the mode changes (and what it doesn't)

The pipeline is always the same: **Pitch → Intake → Role Maker → Research → Devil's Advocate → Synthesis → Report.**
The mode changes **4 things only**:

| | 🌱 Launch | 📈 Grow | 🚑 Rescue | 🧟 Revive |
|---|---|---|---|---|
| **Core questions** | Plan & budget | Current metrics | Metrics over time | The company's history |
| **Adaptive probing goal** | Is the idea real? | Where's the bottleneck, and the biggest threat? | Where exactly is it breaking? | Was the cause of death fixable? |
| **Example agents** | Market Analyst · Pricing Analyst · Reality Checker | Ops Efficiency Auditor · Growth Channel Analyst · Competitor Watcher · Review Miner | Churn Investigator · Local Competition Scout · Sales Data Investigator · Review Miner | Autopsy Analyst · "What Changed Since" Scout · Asset Extractor |
| **Devil's advocate asks** | ☠️ *Pre-mortem:* "It's 12 months from now and you're dead. Why?" | 🛡️ *Red team:* "If I were a new entrant, how would I destroy you?" | "Why will the turnaround fail too?" | "Why will it die a second time?" |
| **Signature section** | 🧪 Riskiest assumption | 🎯 Growth levers (impact × effort) + 🛡️ **Threats** | 📉 **Where you're failing** (trend + ranked root causes) + ☝️ **The ONE thing** | ⚰️ **Autopsy** (cause of death + what's different now) |

**Shared by all modes:** competitors · market · investment · ROI with sliders · devil's advocate · next steps · sources.

> 🧟 **Revive is for the founder or owner** restarting *their own* company, using their own information and documents. Not reviving strangers' startups from a URL, and no deployed "zombie site".

### 📈 Grow: the 🛡️ Threats section
Grow is about **growth and defence**. Alongside the growth levers, the report shows what could kill a company that's working today:

| Element | Example |
|---|---|
| **How a new entrant would destroy you** | *"Undercut on price with VC money for 12 months, poach your top 2 B2B clients."* |
| **Threat list** | Each threat tagged External / Internal / Assumption, with likelihood · impact · early warning sign |
| **The wrapper trap** | *"What if a big platform ships your core feature for free next quarter?"* |
| **Moat check** | What actually protects you today: brand, contracts, data, location, switching costs, or nothing |

One-time analysis. **Ongoing monitoring (a live risk dashboard over weeks) is out of scope for the hackathon**, but it goes on the "what's next" slide.

### 🚑 Rescue: the ☝️ ONE-thing rule
The turnaround plan doesn't hand the user 10 actions. It leads with **one** focus:
> ☝️ **ONE customer:** mid-range EMI buyers · **ONE channel:** in-store with multi-bank EMI · **ONE action this week:** sign 3 more EMI partners

Everything else in the plan is ranked below it, and anything that doesn't acquire, keep or serve customers this quarter is marked **pause**.

---

## ❓ Intake: mode core + adaptive follow-ups

```
Pick mode → AI reads the pitch + uploaded documents → pre-fills what it already knows
         → asks the remaining MODE CORE questions (fixed, needed for the maths)
         → asks ADAPTIVE follow-ups (AI-generated, guided by the mode's playbook)
         → stops when the playbook goals are covered OR after 4 follow-ups
         → editable profile card → start research
```

### Core questions (fixed per mode)

| 🌱 Launch | 📈 Grow | 🚑 Rescue | 🧟 Revive |
|---|---|---|---|
| Budget | Monthly revenue + profit/loss | **Monthly revenue, users and costs for the last 6–12 months** (small table) | What did it do, and who paid for it? |
| Location / market | Customers + growth rate | When did the decline start? | When did it shut down? |
| Team & skills | Team size + biggest cost items | What changed around then? (price, team, product, competitors) | Why do *you* think it died? |
| Timeline | Main acquisition channels | Customer loss and acquisition cost: before vs. now | Peak metrics: revenue and users at its best |
| What exists already | What's working best right now? | Cash in the bank | What's left: brand, users, code, licences, team? |
| Price + monthly cost | Goal: revenue, efficiency or expansion? | What have you already tried? | What's your budget to restart? |

### 🎯 Adaptive playbooks: what the AI digs for in each mode

The AI doesn't ask random questions. Each mode gives it a **playbook of things to find out**. It asks follow-ups only for the goals the answers haven't covered yet.

#### 🌱 Launch: "Is this idea real?"
| Probing goal | Example follow-up |
|---|---|
| Who *exactly* is the customer? | *"You said students. Hostel residents or day scholars? Their budgets differ a lot."* |
| Any proof they'll pay? | *"Has anyone paid or pre-ordered yet, even a friend?"* |
| Unfair advantage | *"What do you have that a bigger player couldn't copy in a month?"* |
| How customers will find you | *"How will your first 100 customers hear about you?"* |
| Regulatory red flags | *"Will you handle money, food, health data or lending?"* |

#### 📈 Grow: "Where's the bottleneck?"
| Probing goal | Example follow-up |
|---|---|
| Concentration risk | *"70% of revenue comes from one channel. What happens if it gets more expensive?"* |
| Demand-limited or capacity-limited? | *"If demand doubled tomorrow, could you deliver?"* |
| Best segment | *"What do your top 10 customers have in common?"* |
| Unit economics per segment | *"Which product or customer type makes the most profit, not the most revenue?"* |
| Operational waste | *"Where does your team spend time on work that doesn't make money?"* |
| Biggest threat | *"Who could take your best customers tomorrow, and why haven't they yet?"* |
| Moat | *"If a competitor copied your product exactly, why would customers stay with you?"* |

#### 🚑 Rescue: "Where exactly is it breaking?"
| Probing goal | Example follow-up |
|---|---|
| Fewer customers, or less per customer? | *"Users are flat but revenue dropped. Did you add discounts or a cheaper plan?"* |
| Footfall or conversion? | *"Are fewer people coming in, or are they coming but not buying?"* |
| Which segment dropped first | *"Which products or price ranges fell the most?"* |
| Timing vs. events | *"Did anything open, launch or change near you around when it started?"* |
| Retention or acquisition | *"Are old customers leaving, or are new ones not arriving?"* |
| Runway | *"At this rate, how many months can you keep going?"* |
| Team issues | *"Has anyone key left, or is the team disagreeing on direction?"* |

#### 🧟 Revive: "Was the cause of death fixable?"
| Probing goal | Example follow-up |
|---|---|
| Real cause vs. founder's belief | *"You said funding ran out. Was revenue growing before it did?"* |
| What changed since | *"Is the thing that blocked you (tech, regulation, cost) still a problem today?"* |
| Assets left | *"You had 20k users at peak. Can you still email them?"* |
| Would customers come back | *"Has anyone asked about you since you shut down?"* |
| Founder readiness | *"What would you do differently this time?"* |

### 📏 Rules for adaptive questions

1. **One question at a time**, and never ask what the pitch or earlier answers already cover.
2. **Every question shows why it's asked:** *"Asking because a price change often explains a sudden drop."*
3. **Offer quick-pick options** when possible (faster on stage), always with "Other" for free text.
4. **Max 4 follow-ups.** Stop early once the playbook goals are covered.
5. **Completeness meter:** *"Profile 70% complete"*. The user can skip to research at any time.
6. **Cost:** 1 call per follow-up, up to 4 per run.

**Build:** one `next_question` endpoint. It takes `mode + pitch + answers so far` and returns `{ question, why, options[] }` or `{ done: true }`. One prompt that includes the mode's core list and playbook.

---

## 🚑 Worked example: phone shop in decline (our Rescue demo company)

### 1. Pitch
> *"My company sells mobile phones. Sales used to be good, but now they're decreasing."*

→ AI preselects **🚑 Rescue**.

### 2. Intake

**Core (fixed):**
| AI asks | User answers |
|---|---|
| Online, shop, or both? | 2 shops in Pune + Instagram |
| Monthly sales, last 12 months? | *(table: ₹18L → ₹9L)* |
| When did the decline start? | Around March |
| What changed around then? | Nothing really |
| Cash in the bank? | ₹12L |
| What have you tried already? | Discounts |

**Adaptive (Rescue playbook):**
| AI asks | Why (shown to the user) | Answer |
|---|---|---|
| Fewer people coming in, or coming but not buying? | Separates footfall from conversion | Fewer coming in |
| Which brands / price ranges sell most? | Shows which segment is leaving | ₹10–25k Xiaomi, Samsung, Realme |
| Do you offer EMI? | EMI drives most mid-range phone purchases | Only through one bank's card |
| Has a big store or online sale started near you? | Usually the biggest external cause | A chain store opened 1 km away in Feb |

### 3. Role Maker
> 🧬 *"Offline phone retail + footfall drop + new competitor + mid-range segment → I need these 4."*

🏪 Local Retail Competition Scout · 🛒 Online Channel Analyst · 💳 Financing & EMI Analyst · 📊 Sales Data Investigator

### 4. Research (live feed)
```
🏪 New chain store offers no-cost EMI across 6 banks + exchange bonus  🔗
🛒 Mid-range phones: online share of sales is rising in the segment     🔗
💳 Most mid-range buyers choose EMI; your 1-bank EMI excludes many      🔗
📊 Your ₹10–25k sales fell 60%; ₹40k+ sales only fell 10%
```

### 5. Devil's Advocate 😈
> *"You can't beat a chain store or Amazon on price. Discounts are just burning your ₹12L faster. If nothing else changes, you have about 7 months left."*

### 6. Report

**🚑 Verdict: 🟡 RECOVERABLE**, Health score 48/100
*"You're not failing everywhere. You're losing the mid-range EMI buyer to the new chain store and online sales."*

**📉 Where you're failing**
```
Sales ₹L
18 ┤●──●──●
   │         ╲          ← 🚩 Feb: chain store opens
12 ┤          ●──●
   │               ╲    ← 🚩 Mar: you start discounting (margin ↓, sales still ↓)
 9 ┤                ●──●──●
   └──────────────────────────
     Oct  Dec  Feb  Apr  Jun
```

| # | Root cause | Type | Evidence | Share of decline |
|---|---|---|---|---|
| 1 | New chain store with better EMI and exchange | 🌍 External | Timing matches Feb + their offers 🔗 | ~45% |
| 2 | Mid-range buyers moving online | 🌍 External | Online segment trend 🔗 + your mid-range −60% | ~30% |
| 3 | EMI through only one bank | 🏠 **Internal: fixable** | Most buyers use EMI 🔗 | ~15% |
| 4 | Discounts hurt margin and didn't help | 🧪 **Assumption: "discounts bring customers back"** | Sales kept falling after March | ~10% |

**☝️ The ONE thing:** mid-range EMI buyers · in-store multi-bank EMI · **this week: sign 3 more EMI partners.** Pause: blanket discounts.

**✅ Still working:** premium phones (₹40k+) · loyal repeat customers · repair walk-ins

**🔧 Turnaround plan**
| Action | Impact | Effort |
|---|---|---|
| Add no-cost EMI from 4–5 banks/NBFCs | 🔴 High | 🟢 Low |
| Stop blanket discounts; offer exchange bonuses instead | 🟡 Med | 🟢 Low |
| Focus on premium, plus accessories and repairs (higher margin) | 🔴 High | 🟡 Med |
| Same-day home delivery to beat online on speed | 🟡 Med | 🟡 Med |

**💰 Runway & ROI:** *"At current burn: 7 months. With the plan: break-even by month 4."* Slider *"EMI partners: 1 → 5"* moves the projection.

**🧪 Riskiest assumption:** *"That customers left because of EMI, not price. Test it: offer multi-bank EMI for 2 weeks and track walk-in conversion."*

> ⚠️ All numbers above are **made-up demo data**. In the real run, every 🔗 claim comes from live research, and "share of decline" is an AI estimate shown as approximate.

---

## 🧠 How every agent thinks (shared checklist)

Whatever the mode or role, every agent's output follows the same checklist, **in one call and one JSON**, not 7 separate calls:

```jsonc
{
  "agent_id": "local_competition_scout",
  "findings": "...",                                   // what it researched
  "core_assumption": "Customers left because of EMI",   // what must be true
  "evidence_for": [ { "point": "...", "source": "..." } ],
  "evidence_against": [ { "point": "...", "source": "..." } ],
  "risks": [ { "risk": "...", "category": "external | internal | assumption", "countermeasure": "..." } ],
  "unit_economics_note": "...",                        // only if relevant to its role
  "sources": [ { "title": "...", "url": "..." } ]
}
```

Risk categories are the same everywhere: 🌍 **External** (market, competition, regulation) · 🏠 **Internal** (team, execution, costs) · 🧪 **Assumption** (untested beliefs).
Compliance (RBI, FSSAI, GST…) is checked **only when the business needs it**: the Role Maker adds a compliance agent for regulated sectors.

---

## 🚫 Facts rule

No statistic goes into a prompt, the product or the pitch **unless we have the source link**. The research notes in `buisness_target/` contain useful frameworks, but their statistics (e.g. "42% / 43% / 44% fail from no market need") are uncited and contradict each other. If we want real failure cases (e.g. Indian fintech), we verify 3–4 ourselves with links.

---

## 🛠️ Build implications (6 hours)

| | Implication |
|---|---|
| ✅ **Shared pipeline** | Each extra mode = 1 core question list + 1 playbook + 1 prompt variant + 1 signature section. Not 4 separate products. |
| 📊 **Grow & Rescue need the user's numbers** | Month-by-month table input, or upload a CSV/Excel or PDF (see [flow.md](flow.md#1️⃣b-document-understanding)). |
| 🎯 **All 4 modes are first-class** | Each needs: core questions · playbook · attack prompt · signature section · **one demo sample company** · **one saved fallback run**. |
| 🎤 **Demo time** | 3 minutes can't show 4 full runs. **One mode live** + **the other 3 as saved runs, ~20s each** (see below). |

### 🧪 Demo sample companies (one per mode)

| Mode | Sample | Story the AI should find |
|---|---|---|
| 🌱 Launch | Tiffin subscriptions for students, Pune | Demand is real, margins are thin → 🟡 PIVOT (add corporate tiffins) |
| 📈 Grow | 3-location coaching institute | 70% of students come from one channel; a free online platform is the threat |
| 🚑 Rescue | 📱 Phone shop, 2 stores, Pune | Chain store + online shift; one-bank EMI is the fixable cause |
| 🧟 Revive | Neighbourhood grocery delivery app, shut down 2022 | Died from delivery cost per order; now viable as a group-order model for apartment societies |

Each sample gets a **one-page PDF profile** (for the upload demo) and, for Grow/Rescue, a **CSV of monthly numbers**.

### ✂️ If we fall behind, cut in this order
1. Positioning scatter · market growth chart · risk matrix
2. Moat check (Grow) · asset list detail (Revive)
3. DOCX/PPTX/image upload (keep PDF + CSV)
4. Live AI follow-ups for Grow/Revive (fall back to core questions only)

**Never cut:** any mode's signature section, the saved fallback runs, the ROI sliders.

## ❓ Decisions

- [x] Mode 2 = 📈 **Grow + 🛡️ Threats** (merged with the "Competitive Fortress" idea; no ongoing monitoring)
- [x] Mode 4 = 🧟 **owner revives their own company** (no URL scraping, no deployed zombie site)
- [x] **All 4 modes are first-class**, each with a demo sample + saved run
- [x] **4 mode cards + AI preselect** from the pitch or uploaded document
