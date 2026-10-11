import { statsOf, type Doc } from './lib'

// A recorded-style run (tiffin service, 3 ghosts, one sent back then accepted), replayed with delays.

export const MOCK_TEXT =
  'I want to start a tiffin service in Pune for college students at ₹2500/month. Two meals a day, home-style food. Is this a good idea?'

// "Use a sample sheet": a phone shop's monthly numbers, falling since March (same shape as the sheet connector returns).
const SHEET_TABLE = {
  columns: ['month', 'revenue_inr', 'footfall', 'avg_ticket_inr'],
  rows: [
    ['Jan 2026', 1840000, 2300, 800], ['Feb 2026', 1925000, 2350, 819], ['Mar 2026', 1980000, 2400, 825], ['Apr 2026', 1610000, 2050, 785],
    ['May 2026', 1390000, 1850, 751], ['Jun 2026', 1210000, 1680, 720], ['Jul 2026', 1060000, 1540, 688], ['Aug 2026', 980000, 1450, 676],
  ],
}
export const MOCK_SHEET: Doc = {
  id: 'mock-sheet', name: 'Phone shop – monthly sales', kind: 'sheet', chars: 412, pages: null,
  table: SHEET_TABLE, stats: statsOf(SHEET_TABLE),
}

const g = {
  arjun: { id: 'arjun', name: 'Arjun, the Budget Student' },
  meera: { id: 'meera', name: 'Meera, the Cloud-Kitchen Operator' },
  vc: { id: 'burned_vc', name: 'The Burned VC' },
}

const caseJson = (o: object) => '```json\n' + JSON.stringify(o, null, 2) + '\n```'

const REPORT = `## 1. Verdict
**PIVOT (price and plan)**
**Confidence: 78%**

Demand is real, but ₹2500/month for two meals a day sits above what most hostel students will pay when mess food costs ₹1800–2200. Launch with a lunch-only plan near two campuses first.

## 2. Question & Context
**Question:** Is a ₹2500/month student tiffin service in Pune viable?

**Context:** Pune has ~5 lakh students; Viman Nagar, Kothrud and Hinjewadi are dense with PGs and hostels.

## 3. Evidence Presented

| Ghost | Claim | Confidence |
|---|---|---|
| Arjun, the Budget Student | ₹2500 is above what most students pay; ₹1800 is the sweet spot | 82% |
| Meera, the Cloud-Kitchen Operator | Unit economics work at 120+ subscribers per kitchen | 71% |
| The Burned VC | Churn during exams and holidays kills subscription tiffins | 76% |

## 4. What to do first
1. Run a 2-week lunch-only pilot at ₹1500/month near one campus.
2. Offer pause days for exams and trips instead of refunds.
3. Hit 120 paying subscribers before adding dinner.

## 5. Competitors & market players

| Company | Listed? (ticker) | What they do | Status / key number | Source link |
|---|---|---|---|---|
| Swiggy | SWIGGY.NS | Food delivery | Student offers in Pune | [swiggy.com](https://www.swiggy.com/) |
| Local messes | n/a | Hostel and PG mess plans | ₹1800–2200/month | [r/pune](https://www.reddit.com/r/pune/) |

## 6. Risks & open questions
- **External:** Swiggy/Zomato student offers undercut on price.
- **Internal:** Food quality drift as volume grows.
- **Assumption:** Students prefer a fixed plan over ordering daily (single source: one Reddit thread).

## 7. Recommended next steps
1. Validate the ₹48/meal food cost from your pitch deck with one week of real purchase bills.
2. Talk to 20 students at one campus before cooking a single meal.

## Verified by code (Yahoo Finance listings + Google News status)
| Company | Listed | Market cap | Revenue (TTM) | Status signal |
|---|---|---|---|---|
| Swiggy | SWIGGY.NS (NSI) | 613.6B INR | 249.0B INR | ⚠️ [Swiggy shuts down a standalone quick-food app](https://news.google.com/) (19 Feb 2026) |
| Zomato (Eternal) | ETERNAL.NS (NSI) | 2.1T INR | 202.4B INR | No shutdown news |
`

const SCORES = {
  overall: 58, label: 'PIVOT',
  dimensions: { 'Market demand': 8, Competition: 5, 'Unit economics': 4, 'Regulation & risk': 7, Execution: 6 },
  plain: {
    verdict_in_plain_words: 'Students do want this, but ₹2500 a month is too much for most of them. Start smaller and cheaper, then grow.',
    what_this_means:
      'Begin with lunch only at around ₹1500 a month near one college. Let students pause during exams and holidays so they don’t cancel. Add dinner only after 120 students are paying every month.',
    confidence_in_plain_words:
      'The council is fairly sure (78%) because three experts agreed on the price problem using real mess prices from Pune. The cost numbers come partly from your own cost sheet, so check them with a week of real bills.',
    dimension_notes: {
      'Market demand': 'Lots of students in Pune want cheap, home-style food.',
      Competition: 'College messes and Swiggy/Zomato offers are already cheap and easy.',
      'Unit economics': 'At ₹2500 few will sign up; at ₹1500 you need many students to make money.',
      'Regulation & risk': 'Only a basic FSSAI food licence is needed. Low legal risk.',
      Execution: 'Cooking and delivering on time every day is hard but doable on one route.',
    },
  },
}

const PLAN = {
  horizon_days: 90,
  goal: 'Get 120 students paying every month for a lunch-only tiffin near one Pune college.',
  first_step_this_week: 'Talk to 20 students outside one college in Kothrud and ask what they pay for food today and what they would pay you.',
  phases: [
    { name: 'Test the idea', start_week: 1, end_week: 3 },
    { name: 'Start small', start_week: 4, end_week: 8 },
    { name: 'Grow carefully', start_week: 9, end_week: 13 },
  ],
  tasks: [
    { id: 't1', title: 'Talk to 20 students at one college', phase: 'Test the idea', start_week: 1, end_week: 1, owner: 'Founder',
      why: 'Find out the real price they will pay before you cook anything.', success_metric: '20 conversations, a price most say yes to', depends_on: [] },
    { id: 't2', title: 'Check food cost with one week of real bills', phase: 'Test the idea', start_week: 1, end_week: 2, owner: 'Founder',
      why: 'Your cost sheet says ₹48 a meal. Make sure it is true.', success_metric: 'Real cost per meal written down', depends_on: [] },
    { id: 't3', title: 'Run a 2-week lunch pilot with 30 students', phase: 'Test the idea', start_week: 2, end_week: 3, owner: 'Founder + cook',
      why: 'See if students like the food and stay.', success_metric: '20 of 30 want to continue', depends_on: ['t1', 't2'] },
    { id: 't4', title: 'Get FSSAI registration', phase: 'Start small', start_week: 3, end_week: 5, owner: 'Founder',
      why: 'You need it to sell food legally.', success_metric: 'Registration certificate in hand', depends_on: [] },
    { id: 't5', title: 'Launch lunch plan at ₹1500/month with pause days', phase: 'Start small', start_week: 4, end_week: 8, owner: 'Founder',
      why: 'Pause days stop students cancelling during exams and holidays.', success_metric: '60 paying students', depends_on: ['t3'] },
    { id: 't6', title: 'Fix one delivery route around the college', phase: 'Start small', start_week: 4, end_week: 6, owner: 'Delivery partner',
      why: 'One tight route keeps delivery near ₹8 a meal.', success_metric: 'All lunches delivered by 1 pm', depends_on: ['t5'] },
    { id: 't7', title: 'Ask happy students to bring friends', phase: 'Grow carefully', start_week: 9, end_week: 12, owner: 'Founder',
      why: 'Word of mouth is the cheapest way to find students.', success_metric: '120 paying students', depends_on: ['t5'] },
    { id: 't8', title: 'Try dinner with 20 students', phase: 'Grow carefully', start_week: 11, end_week: 13, owner: 'Founder + cook',
      why: 'Add dinner only once lunch makes money.', success_metric: 'Dinner covers its own cost', depends_on: ['t7'] },
  ],
  review: {
    strengths: ['Students really want cheap home-style food.', 'Your food cost (₹48 a meal) looks low enough to make money.', 'Pune has many colleges close together.'],
    risks: ['Students leave during exams and holidays.', 'Mess food at ₹1800–2200 is cheaper than your plan.', 'Food quality can slip as you grow.'],
    stop_doing: ['Stop planning for 400 students by month 6. Aim for 120 first.', 'Don’t start with two meals a day.', 'Don’t rent a big kitchen before the pilot works.'],
  },
}

const chunks = REPORT.match(/[\s\S]{1,60}/g) ?? []

type Ev = [delay: number, event: string, data: unknown]

const ALL: Ev[] = [
  [300, 'status', 'routing'],
  [400, 'documents', { items: [
    { id: 'doc1', name: 'tiffin-pitch-deck.pdf', kind: 'pdf', chars: 18420, pages: 12 },
    { id: 'doc2', name: 'cost-sheet.csv', kind: 'csv', chars: 2310, pages: null },
  ] }],
  [1800, 'route', { topic: 'food_subscription_launch', complexity: 'complex', needs_web: true, search_queries: ['tiffin service Pune students price', 'student mess cost Pune 2025'] }],
  [200, 'status', 'researching'],
  [3200, 'research', [
    { query: 'tiffin service Pune students price', chunks_stored: 14, per_source: { web: 7, news: 4, reddit: 3 } },
    { query: 'student mess cost Pune 2025', chunks_stored: 11, per_source: { web: 6, news: 2, reddit: 3 } },
  ]],
  [300, 'status', 'role_making'],
  [2600, 'manifest', {
    domain: 'Food subscription, student market, Pune',
    problem_summary: 'A home-style tiffin subscription for Pune students at ₹2500/month: is the price right and will students stay?',
    agents: [
      { ...g.arjun, system_prompt: 'A second-year engineering student in Kothrud who lives on a ₹6000/month allowance and has tried three mess plans.', tools: ['web_research'], research: [{ query: 'Pune hostel mess monthly charges', sources: ['web', 'reddit'] }] },
      { ...g.meera, system_prompt: 'Runs two cloud kitchens in Pune; thinks in cost per meal, delivery routes and break-even.', tools: ['web_research'], research: [{ query: 'cloud kitchen tiffin unit economics India', sources: ['web', 'news'] }] },
      { ...g.vc, system_prompt: 'An investor who lost money on two meal-subscription startups and looks for churn first.', tools: ['web_research'], research: [{ query: 'food subscription startup shut down India churn', sources: ['news'] }] },
    ],
  }],
  [300, 'status', 'in_court'],
  [5200, 'pre_research', {
    arjun: [{ query: 'Pune hostel mess monthly charges', per_source: { web: 5, reddit: 4 } }],
    meera: [{ query: 'cloud kitchen tiffin unit economics India', per_source: { web: 6, news: 3, document: 2 } }],
    burned_vc: [{ query: 'food subscription startup shut down India churn', per_source: { news: 8 } }],
  }],
  [4200, 'agent_output', { ...g.vc, agent_id: 'burned_vc', output: caseJson({
    claim: 'Subscription tiffins die from churn, not demand: students vanish for exams, holidays and internships, so a monthly plan loses 30–40% of subscribers every few months.',
    evidence: [
      { fact: 'Several Indian meal-subscription startups shut down citing churn and thin margins', source: 'https://inc42.com/', source_type: 'news' },
      { fact: 'Academic calendars leave ~3 months a year with low campus occupancy', source: 'university calendars', source_type: 'web' },
    ],
    confidence: 0.76, emotion: 'wary',
  }) }],
  [1500, 'agent_output', { ...g.arjun, agent_id: 'arjun', output: caseJson({
    claim: 'Most students I know pay ₹1800–2200 for mess food. At ₹2500 I would only switch if it is clearly better and I can pause it.',
    evidence: [
      { fact: 'Hostel mess plans around Kothrud and Viman Nagar cost ₹1800–2200/month', source: 'https://www.reddit.com/r/pune/', source_type: 'reddit' },
      { fact: 'Students rank price and flexibility above taste', source_type: 'web' },
      { fact: 'Your pitch deck targets 400 subscribers by month 6', source: 'tiffin-pitch-deck.pdf', source_type: 'document' },
    ],
    confidence: 0.82, emotion: 'skeptical',
    search_log: { unknowns: ['How many students already use a tiffin vs. a mess'] },
  }) }],
  [1800, 'agent_output', { ...g.meera, agent_id: 'meera', output: caseJson({
    claim: 'This works if you get the numbers right.',
    evidence: [{ fact: 'Food costs are manageable', source_type: 'web' }],
    confidence: 0.6, emotion: 'optimistic',
  }) }],
  [800, 'window', { round: 0, chunks: 18, by_source: { web: 9, news: 5, reddit: 4 } }],
  [5500, 'rulings', { attempt: 0, rulings: {
    arjun: { decision: 'accept', reason: 'Grounded in real local prices from students themselves.', search_quality: 0.8, missing_sources: [], needs_more: null, guidance: '' },
    burned_vc: { decision: 'accept', reason: 'Churn risk is specific and backed by shutdowns.', search_quality: 0.7, missing_sources: [], needs_more: null, guidance: '' },
    meera: { decision: 'retry', reason: 'No numbers. "Manageable" is not evidence.', search_quality: 0.3, missing_sources: ['news', 'web'], needs_more: 'unit economics', guidance: 'Give cost per meal, break-even subscriber count and delivery cost per route, with sources.' },
  } }],
  [1500, 'tool_call', { agent_id: 'meera', name: 'web_research', args: { query: 'tiffin service cost per meal break even India', sources: ['web', 'news'] } }],
  [3500, 'tool_call', { agent_id: 'meera', name: 'web_research', args: { query: 'Pune tiffin delivery cost per route' } }],
  [3800, 'agent_output', { ...g.meera, agent_id: 'meera', output: caseJson({
    claim: 'At ₹45–55 food cost per meal and ₹8 delivery per meal on a dense route, break-even is about 120 subscribers per kitchen at ₹2500, or 170 at ₹1800.',
    evidence: [
      { fact: 'Home-style tiffin food cost runs ₹45–55 per meal in tier-1 cities', source: 'https://yourstory.com/', source_type: 'news' },
      { fact: 'Batch delivery on a 2 km campus route costs about ₹8 per meal', source: 'https://www.dunzo.com/', source_type: 'web' },
      { fact: 'Kitchen rent in Kothrud ₹25–35k/month', source_type: 'web' },
      { fact: 'Your cost sheet puts raw food at ₹48 per meal and packaging at ₹6', source: 'cost-sheet.csv', source_type: 'document' },
    ],
    confidence: 0.71, emotion: 'confident',
  }) }],
  [700, 'window', { round: 1, chunks: 9, by_source: { web: 5, news: 4 } }],
  [4500, 'rulings', { attempt: 1, rulings: {
    meera: { decision: 'accept', reason: 'Now gives a break-even figure with sourced costs.', search_quality: 0.75, missing_sources: [], needs_more: null, guidance: '' },
  } }],
  [400, 'status', 'summarizing'],
  // Scores and the plan arrive early, before (and while) the report streams.
  [1200, 'scores', SCORES],
  [900, 'plan', PLAN],
  ...chunks.map((c, i): Ev => [i === 0 ? 1200 : 90, 'report_chunk', c]),
  [600, 'verdict', REPORT.split('## 2.')[0].replace('## 1. Verdict\n', '')],
  [100, 'summary', REPORT],
  [100, 'usage', { 'gemma-3-27b': { calls: 11, input: 48210, output: 6120, thinking: 0 } }],
  [50, 'call_log', Array.from({ length: 11 }, (_, i) => ({ step: 'mock', key: i, input: 0, output: 0 }))],
  [100, 'status', 'done'],
]

/** Replays the mock run into `emit`. Returns a cancel function. */
export function playMock(emit: (event: string, data: unknown) => void, opts: { url?: string; sheet?: boolean; interrupted?: boolean } = {}): () => void {
  let base = ALL
  if (opts.sheet) base = base.map((e): Ev => (e[1] === 'documents' ? [e[0], 'documents', { items: [...(e[2] as { items: Doc[] }).items, MOCK_SHEET] }] : e))
  // Server restarted mid-court: everything up to the first rulings, then status "interrupted".
  if (opts.interrupted) base = [...base.slice(0, base.findIndex((e) => e[1] === 'rulings') + 1), [1500, 'status', 'interrupted']]
  // With a website, the court reads it first (url + prompt are sent together).
  const host = opts.url?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
  const EVENTS: Ev[] = !opts.url ? base : [
    base[0],
    [400, 'status', 'scraping'],
    [1500, 'startup_data', {
      latest_snapshot: { title: host, description: `Archived homepage of ${host}, last captured before it went quiet.`, snapshot_url: `https://web.archive.org/web/2024/${opts.url}` },
      hn_discussions: [{ title: `Ask HN: What happened to ${host}?`, hn_url: 'https://news.ycombinator.com/' }],
    }],
    ...base.slice(1),
  ]
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>
  let i = 0
  const step = () => {
    if (cancelled || i >= EVENTS.length) return
    const [delay, event, data] = EVENTS[i++]
    timer = setTimeout(() => { if (!cancelled) { emit(event, data); step() } }, delay)
  }
  step()
  return () => { cancelled = true; clearTimeout(timer) }
}
