# Necromancer frontend spec (Lovable build brief)

> Paste this whole file into Lovable as the project brief. It describes every screen, component, data type and visual rule. Build against the **mock data in section 9** first; switch to the real backend by setting `VITE_API_BASE`.

---

## 1. What the product is

Necromancer reads a short description of a business and tells the owner where it stands and what to do next. Behind the scenes, an AI "court" runs: a Role Maker invents a team of expert agents ("ghosts") for this specific business, each ghost argues a case with evidence, a Judge sends weak cases back for another try, and finally the Judge rules and writes a report.

**The user never picks a category.** They describe their situation in their own words. The system works out which of four situations it is and adapts the investigation:

| Situation (internal id) | What the user might type | What we investigate | Verdict labels |
|---|---|---|---|
| `launch` — a new idea | "I want to start a tiffin service for students in Pune" | Should this be built? | GO · PIVOT · NO-GO |
| `grow` — working business | "We run 3 coaching centres, want to expand" | Where to grow, and what could kill it | STRONG · EXPOSED · AT RISK |
| `rescue` — declining business | "My phone shop's sales have halved since March" | Why it's declining, the one fix | RECOVERABLE · RESTRUCTURE · WIND DOWN |
| `revive` — shut-down company | "My grocery app shut in 2022, can I restart it?" or a URL | Why it died, what's different now | REVIVE · REVIVE WITH PIVOT · STAY DEAD |

The words "Launch / Grow / Rescue / Revive" are **never shown as buttons or choices**. The UI speaks in plain sentences ("This reads like a business that's losing ground"). The stage only shows up as a small tag on the case file once detected.

**Audience:** small-business owners and early founders in India, not analysts. Plain language, ₹ amounts, no jargon without a one-line explanation.

---

## 2. Stack

- React + Vite + TypeScript, Tailwind, shadcn/ui (restyled with the tokens below, not default look)
- React Router: two routes, `/` and `/case/:id`
- Recharts for charts; gauge drawn as plain SVG
- `react-markdown` for the Judge's summary
- Native `EventSource` for live updates (SSE)
- `VITE_API_BASE` env var (default `http://localhost:8000`). If `VITE_USE_MOCK=true`, replay the mock event stream from section 9 with realistic delays instead of calling the network.

---

## 3. Visual direction: "the case file"

The metaphor is a **court record being written in real time**: the user hands over their situation, and a dossier fills itself in, testimony by testimony, until the Judge stamps a verdict. Not spooky Halloween, not a SaaS dashboard. Think a well-kept legal file: calm paper, precise ink, one wax seal.

### Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#EEF0EC` | `#161A22` | Page background (cool fog grey, not cream) |
| `--sheet` | `#F8F9F6` | `#1E232D` | The case-file surface |
| `--ink` | `#1E2430` | `#E4E7EC` | Text |
| `--ink-soft` | `#5B6475` | `#9AA3B2` | Secondary text, timestamps |
| `--ghost` | `#8FA3B8` | `#7D93AB` | Agents: their rail, avatar ring, quote bar |
| `--seal` | `#7A1F2B` | `#B4414F` | The Judge only: rulings, verdict seal, primary button |
| `--go` | `#2F6B4F` | `#4F9A76` | Positive verdicts |
| `--caution` | `#B4832A` | `#D1A04A` | Middle verdicts |
| `--stop` | `#9C2F2F` | `#C75454` | Negative verdicts |

Respect `prefers-color-scheme`, plus a light/dark toggle in the header.

### Type

- **Newsreader** (Google Fonts, serif) for the user's own words, ghost testimony, verdict text and headings. Testimony reads like quoted speech.
- **IBM Plex Sans** for UI: buttons, inputs, meta, tables.
- Scale: 14 / 16 / 20 / 28 / 44 px. Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows above headings.
- Body max width ~68ch.

### Shape and motion

- The case file is one continuous sheet with a thin left margin rule (like ruled paper); entries are separated by space and a hairline, **not** chopped into identical cards with shadows.
- Ghosts get a 3px `--ghost` bar on the left of their testimony. The Judge's entries get `--seal`.
- Radius: 6px on inputs and buttons, 2px on the sheet. No gradients.
- **One signature motion:** when the verdict arrives, a circular wax-seal stamp in `--seal` presses onto the verdict block (scale 1.15 → 1, 250ms, slight rotation). Everything else just appears; new entries scroll into view gently. Honour `prefers-reduced-motion` (no stamp animation, no auto-scroll).
- Visible keyboard focus rings (`--seal`, 2px offset). Works down to 360px wide.

---

## 4. Screen 1: `/` Tell us the situation

One question, one box. No mode cards.

```
┌───────────────────────────────────────────────────────────┐
│  Necromancer                                    [◐ theme] │
│                                                           │
│  What's going on with your business?                      │
│  An idea, a business that's growing or struggling, or     │
│  one that already shut down. Describe it like you'd tell  │
│  a friend.                                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ My company sells mobile phones. Sales used to be    │  │
│  │ good but they've halved since March…                │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│  Shut down already? Add its old website (optional)        │
│  [ https://                                          ]    │
│                                                           │
│                              [ Open the case ]            │
│                                                           │
│  Try one:  Tiffin service idea · Coaching centres ·       │
│            Phone shop losing sales · Grocery app that     │
│            shut down                                      │
│                                                           │
│  Recent cases                                             │
│  Phone shop, Pune · Recoverable · 2 days ago              │
└───────────────────────────────────────────────────────────┘
```

- Big Newsreader headline, textarea auto-grows, 20–4000 characters. Button disabled until 20 chars or a URL is entered; helper text says how many more characters are needed.
- **Live hint while typing (should-have):** after the user pauses for 800ms with 40+ characters, show one quiet line under the box, e.g. *"Sounds like sales are falling. We'll look for why."* This comes from `POST /api/classify` (section 8). It's informational only; there is nothing to click. If the call fails or is slow, show nothing.
- URL field is always visible but secondary. A URL alone is enough to submit (that's a shut-down company).
- "Try one" fills the textarea with the sample pitch (section 9). Plain text links, not chips.
- "Recent cases": last 5 session ids stored in `localStorage` with their title, verdict and date. Hidden when empty.
- Submit → `POST /api/analyze` → navigate to `/case/:id`.

---

## 5. Screen 2: `/case/:id` The case file

One page that fills in live and **becomes** the report when the court finishes. No wizard, no separate report page.

### Layout

```
Desktop (≥1024px)
┌──────────────┬────────────────────────────────────────────┐
│ Proceedings  │  Case file                                  │
│ (sticky)     │                                             │
│ ✓ Read       │  "My company sells mobile phones…" (user)   │
│ ✓ Situation  │  ── Situation: losing ground  [rescue tag]  │
│ ✓ Research   │  ── Research: 3 searches, 24 sources        │
│ ● Testimony  │  ── The court assembled: 4 experts          │
│ ○ Rulings    │  ── Testimony (live)                        │
│ ○ Verdict    │  ── Judge's rulings                         │
│ ○ Report     │  ── Verdict + signature section             │
│              │  ── Full report                             │
└──────────────┴────────────────────────────────────────────┘
Mobile: the proceedings rail collapses into a one-line progress strip at the top.
```

The left rail mirrors backend `status` (section 7) and doubles as in-page navigation once done.

### Entries, in order

**a. The user's words.** Their text in Newsreader italics, as the opening of the file. URL shown under it if given.

**b. Situation read** (from the `stage` event). One sentence in plain English plus a small tag:

| stage | Sentence |
|---|---|
| `launch` | "This is a new idea. We'll test whether it's worth building." |
| `grow` | "This business is working. We'll look for room to grow and what could hurt it." |
| `rescue` | "This business is losing ground. We'll find out why and what to fix first." |
| `revive` | "This company has shut down. We'll find out why it died and whether it can come back." |

Below it, the classifier's own reason in `--ink-soft` (e.g. *"You mentioned sales halving since March."*). And a quiet text link: **"Not quite right?"** which opens a small popover with the other three sentences; choosing one calls `POST /api/analyze` again with `stage_override` and replaces the case. This is the only place stage can be changed, and it's a correction, not a choice.

If confidence < 0.6, show the read with "We think…" wording and the correction popover already open.

**c. Autopsy** (only when `startup_data` arrives, i.e. a URL was given): the old site's title and description, last archived date, link to the archive snapshot, and any Hacker News discussions as links.

**d. Research.** One line per search query with the number of sources stored. Collapsed by default after it completes.

**e. The court assembled** (from `manifest`). The Role Maker's one-line summary (`problem_summary`) in Newsreader, then a row of expert chips: generated avatar (initials in a `--ghost` ring) + name. Chips appear one by one 120ms apart. Clicking a chip scrolls to that expert's testimony.

**f. Testimony** (from `agent_output`, `tool_call`). One block per ghost:

```
│ Local Retail Competition Scout            confident · 0.8
│ "A chain store opened 1 km away in February offering
│  no-cost EMI across 6 banks. Your mid-range buyers left
│  for it."
│   Evidence
│   • Chain store EMI offer — source ↗
│   • Mid-range sales fell 60% — sales data
│   Checked: web_research("chain store pune emi")
```

- Before output arrives: name + "is investigating…" with the latest `tool_call` shown as "Searching: …".
- `claim` as a Newsreader quote. `emotion` + `confidence` small, top right. Confidence as text ("confident", "fairly sure", "unsure") with the number on hover.
- Evidence list: each fact with its source; URLs open in a new tab. **Facts rule:** if a fact has no source, show it greyed with "unsourced".
- When the backend sends the extended fields (section 8) also show: "Rests on: *core_assumption*", evidence for/against in two short lists, risks tagged External / Internal / Assumption.
- `ghost_dropped`: the block greys out with "Left the court: couldn't produce a case."
- Ghosts run in parallel; each block updates independently.

**g. Judge's rulings** (from `rulings`). Under each ghost's testimony, a small stamp: **Accepted** (`--go` outline) or **Sent back** (`--seal`) with the Judge's reason and guidance in a `--seal` quote bar. When that ghost's new `agent_output` arrives, keep the old claim visible but struck through and collapsed ("First answer"), and show the new claim beneath it. Show "Round 2" etc. from `attempt`.

**h. Verdict** (from `verdict`). The Judge's block, the one bold moment on the page:

```
            ┌──────────────────────────────────────┐
   (seal)   │  Recoverable                          │
            │  You're not failing everywhere. You   │
            │  are losing mid-range EMI buyers to   │
            │  a new chain store and online sales.  │
            └──────────────────────────────────────┘
```

- Label coloured by verdict family (`--go` / `--caution` / `--stop`), 44px Newsreader. Seal stamp animation.
- Today `verdict` is free text: show it as the verdict paragraph and derive the label by matching the stage's verdict words (section 1) in the text, case-insensitive. No match → no label, just the paragraph.
- If a numeric `score` is provided later, show a radial gauge (0–100) beside the label.

**i. Signature section** (directly under the verdict, picked by stage). Built from testimony already on the page:

| stage | Section | Source |
|---|---|---|
| `launch` | **The riskiest assumption** — the one untested belief the plan depends on, and a cheap way to test it | lowest-confidence `core_assumption`; fallback: lowest-confidence claim |
| `grow` | **What could hurt you** — threats tagged External / Internal / Assumption | `risks` across cases; fallback: claims from ghosts whose names suggest competition or risk |
| `rescue` | **Where you're losing** + **The one thing to do first** | `evidence_against`; "one thing" = first action sentence in the summary |
| `revive` | **Cause of death and what's changed** | `startup_data` + the original `core_assumption` |

If the data for a section isn't available, hide it. Never show an empty card.

**j. Full report** (from `summary`, markdown). Rendered with good typographic defaults: h2/h3 in Newsreader, tables styled, links as sources. Under it:
- **Sources**: every URL from all evidence, grouped by expert.
- Actions: "Copy link", "Print / save as PDF" (print stylesheet: hide rail and actions, keep sheet), "Start a new case".

### States

| State | What shows |
|---|---|
| Connecting | The user's words + "Opening the case…" |
| Simple question (route `complexity: "simple"`) | Skip the court; show the answer as the verdict paragraph with no label and no seal, and a note "This was a quick question, so no court was needed." |
| Stream drops | Banner "Lost connection. Reconnecting…"; retry the stream 3 times with backoff, then poll `GET /api/session/:id` every 3s until `done`/`error` |
| Error | Inline in the file: what failed in the backend's words, plus "Try again" (re-submits the same text) and "Start a new case" |
| Revisit a finished case | `GET /api/session/:id` and render straight to the finished file (no animation) |
| Unknown id | "We couldn't find that case." + link home |

---

## 6. Components

```
AppShell (header, theme toggle)
SituationForm, ClassifyHint, SampleLinks, RecentCases
CaseFile
  ProceedingsRail / ProgressStrip
  UserStatement
  SituationRead (+ CorrectStagePopover)
  AutopsyEntry
  ResearchEntry
  CourtAssembled (ExpertChip)
  Testimony (EvidenceList, RiskList, ToolTrace, RulingStamp, RevisedClaim)
  Verdict (WaxSeal, ScoreGauge)
  SignatureSection (RiskiestAssumption | Threats | WhereLosing + OneThing | CauseOfDeath)
  Report (markdown), SourcesList, CaseActions
ConnectionBanner, ErrorEntry
```

State: one `useCaseStream(id)` hook that owns the EventSource and reduces events into a single `CaseState` object (section 7). Components only read from it.

---

## 7. Data contract

### Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/analyze` | `{ text?: string, url?: string, stage_override?: Stage }` | `{ session_id, stream_url }` |
| POST | `/api/classify` | `{ text: string }` | `{ stage, confidence, reason }` (hint only) |
| GET | `/api/stream/:id` | — | SSE stream |
| GET | `/api/session/:id` | — | `SessionState` snapshot |

### Types

```ts
type Stage = "launch" | "grow" | "rescue" | "revive";
type Status = "pending" | "routing" | "scraping" | "researching"
            | "role_making" | "in_court" | "summarizing" | "done" | "error";

interface StageRead { stage: Stage; confidence: number; reason: string; }
interface Route { topic: string; complexity: "simple" | "complex"; needs_web: boolean; search_queries: string[]; }
interface Expert { id: string; name: string; tools: string[]; }
interface Manifest { domain: string; problem_summary: string; agents: Expert[]; }

interface Evidence { fact: string; source?: string; }
interface Risk { risk: string; category: "external" | "internal" | "assumption"; countermeasure?: string; }
interface Case {
  claim: string;
  evidence?: Evidence[];            // today
  confidence: number;               // 0..1
  emotion?: string;
  core_assumption?: string;         // extended (optional)
  evidence_for?: Evidence[];        // extended (optional)
  evidence_against?: Evidence[];    // extended (optional)
  risks?: Risk[];                   // extended (optional)
}
interface Ruling { agent_id: string; decision: "accept" | "retry"; reason: string; guidance: string; }

interface CaseState {
  id: string; text?: string; url?: string;
  status: Status; stage?: StageRead; route?: Route;
  startupData?: any; research?: { query: string; chunks_stored: number }[];
  manifest?: Manifest;
  cases: Record<string, { current?: Case; previous?: Case[]; toolCalls: string[]; dropped?: string; ruling?: Ruling; round: number }>;
  verdict?: string; score?: number; summary?: string; error?: string;
}
```

### SSE events

Each message is `event: <name>` + `data: <json>`.

| Event | data | Effect |
|---|---|---|
| `stage` | `StageRead` | Situation read entry |
| `status` | `Status` string | Advance rail; `done`/`error` closes the stream |
| `route` | `Route` | If `complexity === "simple"`, switch to simple-question layout |
| `startup_data` | scraper object | Autopsy entry |
| `research` | `[{query, chunks_stored}]` | Research entry |
| `manifest` | `Manifest` | Court assembled |
| `tool_call` | `{agent_id, name, args}` | Ghost's "Searching: …" line |
| `agent_output` | `{agent_id, name, output}` | **`output` is a string**: try `JSON.parse` (strip ```json fences first); if it fails, treat the whole string as `claim` with confidence 0.3. If the ghost already had a case, move it to `previous` |
| `rulings` | `{attempt, rulings: Record<id, Ruling>}` | Stamps + round number |
| `ghost_dropped` | `{agent_id, error}` | Grey out |
| `verdict` | string | Verdict entry |
| `score` | number 0–100 | Gauge (optional, future) |
| `summary` | markdown string | Report |
| `error` | string | Error entry |

---

## 8. Backend changes this UI needs

So frontend and backend stay in sync. The UI must still work if only the first item is done.

1. **`POST /api/analyze`** replaces the choice between `/api/problem` and `/api/revive`: if `url` is present, run the revive (scrape) flow; otherwise the problem flow. Before the court starts, classify the text into a `Stage` (one cheap Gemma call; URL-only means `revive`), store it on `SessionState.stage`, and emit a `stage` event. Honour `stage_override`. Pass the stage into the Role Maker and Judge prompts.
2. **`POST /api/classify`**: same classifier, no session; used for the typing hint.
3. Extend the ghost case JSON with `core_assumption`, `evidence_for`, `evidence_against`, `risks` (optional on the frontend, so it can ship before this).
4. Judge computes a 0–100 `score` in code from per-dimension ratings and emits a `score` event; verdict text starts with one of the stage's verdict labels.
5. Allow CORS for the Lovable preview domain.

---

## 9. Mock data (build against this first)

Samples for "Try one":

| Link text | Text |
|---|---|
| Tiffin service idea | "I want to start a monthly tiffin subscription for college students in Pune, around ₹2,500 a month. I have ₹10L and two friends to help." |
| Coaching centres | "We run 3 coaching centres in Nagpur for JEE prep, about 900 students. Revenue is growing but most students come from one referral network. Where should we expand?" |
| Phone shop losing sales | "My company sells mobile phones from 2 shops in Pune. Sales used to be ₹18L a month but have dropped to ₹9L since March. Discounts didn't help." |
| Grocery app that shut down | "I ran a neighbourhood grocery delivery app in Indore that shut down in 2022. Delivery costs per order were too high. Is it worth restarting?" |

Mock stream for the phone shop (replay with 300–1200ms gaps):

```json
[
  ["status", "routing"],
  ["stage", {"stage": "rescue", "confidence": 0.91, "reason": "You said sales dropped from ₹18L to ₹9L since March."}],
  ["route", {"topic": "retail decline", "complexity": "complex", "needs_web": true,
             "search_queries": ["mobile phone retail pune 2026", "no cost emi smartphone buyers india", "chain electronics store pune opening"]}],
  ["status", "researching"],
  ["research", [{"query": "mobile phone retail pune 2026", "chunks_stored": 9},
                {"query": "no cost emi smartphone buyers india", "chunks_stored": 8},
                {"query": "chain electronics store pune opening", "chunks_stored": 7}]],
  ["status", "role_making"],
  ["manifest", {"domain": "offline phone retail", "problem_summary": "Two-store phone retailer losing mid-range buyers; need local competition, online channel, EMI financing and sales data views.",
                "agents": [{"id": "local_scout", "name": "Local Retail Competition Scout", "tools": ["web_research"]},
                           {"id": "online_analyst", "name": "Online Channel Analyst", "tools": ["web_research"]},
                           {"id": "emi_analyst", "name": "Financing & EMI Analyst", "tools": ["web_research"]},
                           {"id": "sales_investigator", "name": "Sales Data Investigator", "tools": ["search_memory"]}]}],
  ["status", "in_court"],
  ["tool_call", {"agent_id": "local_scout", "name": "web_research", "args": {"query": "chain store pune emi offers"}}],
  ["agent_output", {"agent_id": "local_scout", "name": "Local Retail Competition Scout",
    "output": "{\"claim\": \"A chain store opened nearby in February with no-cost EMI from 6 banks; it is taking your mid-range buyers.\", \"evidence\": [{\"fact\": \"Chain store advertises no-cost EMI across 6 banks\", \"source\": \"https://example.com/chain-emi\"}], \"confidence\": 0.8, \"emotion\": \"confident\", \"core_assumption\": \"Customers left because of EMI, not price\", \"risks\": [{\"risk\": \"Chain store expands exchange offers\", \"category\": \"external\", \"countermeasure\": \"Match with multi-bank EMI\"}]}"}],
  ["agent_output", {"agent_id": "online_analyst", "name": "Online Channel Analyst",
    "output": "{\"claim\": \"Mid-range buyers are shifting online.\", \"evidence\": [{\"fact\": \"Online share rising in ₹10–25k segment\"}], \"confidence\": 0.5, \"emotion\": \"unsure\"}"}],
  ["agent_output", {"agent_id": "emi_analyst", "name": "Financing & EMI Analyst",
    "output": "{\"claim\": \"Offering EMI through only one bank excludes most mid-range buyers.\", \"evidence\": [{\"fact\": \"Most mid-range phone purchases use EMI\", \"source\": \"https://example.com/emi-share\"}], \"confidence\": 0.75, \"emotion\": \"fairly sure\"}"}],
  ["agent_output", {"agent_id": "sales_investigator", "name": "Sales Data Investigator",
    "output": "{\"claim\": \"₹10–25k sales fell 60% while ₹40k+ fell only 10%.\", \"evidence\": [{\"fact\": \"Segment split from your numbers\", \"source\": \"user input\"}], \"confidence\": 0.85, \"emotion\": \"confident\"}"}],
  ["rulings", {"attempt": 0, "rulings": {
    "local_scout": {"agent_id": "local_scout", "decision": "accept", "reason": "Timing and evidence line up.", "guidance": ""},
    "online_analyst": {"agent_id": "online_analyst", "decision": "retry", "reason": "No source for the online shift.", "guidance": "Find a cited figure for online share of ₹10–25k phone sales."},
    "emi_analyst": {"agent_id": "emi_analyst", "decision": "accept", "reason": "Sourced and specific.", "guidance": ""},
    "sales_investigator": {"agent_id": "sales_investigator", "decision": "accept", "reason": "Uses the owner's own numbers.", "guidance": ""}}}],
  ["agent_output", {"agent_id": "online_analyst", "name": "Online Channel Analyst",
    "output": "{\"claim\": \"Online sales now take a growing share of ₹10–25k phones, driven by festival sales.\", \"evidence\": [{\"fact\": \"Online share of mid-range smartphones rising year on year\", \"source\": \"https://example.com/online-share\"}], \"confidence\": 0.7, \"emotion\": \"fairly sure\"}"}],
  ["rulings", {"attempt": 1, "rulings": {
    "online_analyst": {"agent_id": "online_analyst", "decision": "accept", "reason": "Now sourced.", "guidance": ""}}}],
  ["verdict", "RECOVERABLE. You're not failing everywhere: you're losing mid-range EMI buyers to a new chain store and online sales. Premium phones and repairs still work."],
  ["status", "summarizing"],
  ["summary", "## Where you're losing\n\n| Cause | Type | Share |\n|---|---|---|\n| New chain store with better EMI | External | ~45% |\n| Mid-range buyers moving online | External | ~30% |\n| EMI from only one bank | Internal, fixable | ~15% |\n| Discounts hurt margin | Assumption | ~10% |\n\n## The one thing\n\nSign 3 more EMI partners this week. Pause blanket discounts.\n\n## Turnaround plan\n\n1. Add no-cost EMI from 4–5 banks/NBFCs\n2. Replace discounts with exchange bonuses\n3. Push premium phones, accessories and repairs\n"],
  ["status", "done"]
]
```

Mock URLs use `example.com`; label the mock mode with a small "Demo data" tag in the header so nobody mistakes it for real research.

---

## 10. Out of scope for this pass

Document upload, intake questionnaire, ROI sliders, TAM/SAM/SOM, competitor tables and the rest of the 12-section report from [demo-spec.md](demo-spec.md). They come after the backend produces that data. Don't build placeholders for them.
