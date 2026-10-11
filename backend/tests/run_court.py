"""Live end-to-end run of the court flow with a readable log.



Run:  python test/run_court.py "your question"

"""



import asyncio

import json

import os

import sys

import time

from pathlib import Path



os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))



from app.agents.orchestrator import Orchestrator, parse_case  # noqa: E402

from app.models.session import SessionState  # noqa: E402

from app.services.blackboard import Blackboard  # noqa: E402



QUESTION = sys.argv[1] if len(sys.argv) > 1 else "Sora AI was shut down due to cost. Analyze why and what OpenAI should do next."





def show(t: float, e) -> None:

    d, ts = e.data, f"[{t:6.1f}s]"

    if e.event == "status":

        print(f"\n{ts} ===== {str(d).upper()} =====")

    elif e.event == "route":

        print(f"{ts} ROUTER  topic={d['topic']!r} complexity={d['complexity']} needs_web={d['needs_web']}")

        for q in d["search_queries"]:

            print(f"          search -> {q!r}")

    elif e.event == "research":

        for r in d:

            print(f"{ts} SCRAPED {r['chunks_stored']:3} chunks for {r['query']!r}  per source={r['per_source']}")

    elif e.event == "window":

        print(f"{ts} WINDOW  round {d['round']}: Soul Binder sees {d['chunks']} fresh chunks {d['by_source']}")

    elif e.event == "manifest":

        print(f"{ts} ROLE MAKER spawned {len(d['agents'])} ghosts:")

        for a in d["agents"]:

            print(f"          - {a['id']:24} {a['name']}  tools={a['tools']}")

    elif e.event == "tool_call":

        print(f"{ts} TOOL    {d['agent_id']} -> {d['name']}({json.dumps(d['args'])[:120]})")

    elif e.event == "agent_output":

        c = parse_case(d["output"])

        print(f"{ts} CASE    {d['agent_id']} (conf={c['confidence']}, emotion={c['emotion']!r})")

        print(f"          claim: {c['claim'][:220]}")

        print(f"          evidence: {len(c['evidence'])} items from {len(c['source_types'])} source types {c['source_types']}")

        log = c.get("search_log") or {}

        if log:

            print(f"          searched: {log.get('queries')}  hits={log.get('sources_hit')}")

            if log.get("unknowns"):

                print(f"          still unknown: {log['unknowns']}")

    elif e.event == "rulings":

        print(f"{ts} SOUL BINDER RULINGS (attempt {d['attempt']}):")

        for aid, r in d["rulings"].items():

            mark = "ACCEPT" if r["decision"] == "accept" else "SENT BACK"

            print(f"          {mark:9} {aid}  search_quality={r['search_quality']}: {r['reason'][:200]}")

            if r["decision"] == "retry":

                print(f"          needs_more -> {r['needs_more'][:200]}  missing={r['missing_sources']}")

                print(f"          guidance   -> {r['guidance'][:200]}")

    elif e.event == "verdict":

        print(f"{ts} VERDICT\n{d}")

    elif e.event == "summary":

        print(f"{ts} SUMMARY ready ({len(d)} chars)")

    elif e.event == "ghost_dropped":

        print(f"{ts} DROPPED {d['agent_id']} (API kept failing)")

    elif e.event == "usage":

        total_in = sum(m["input"] for m in d.values())

        total_out = sum(m["output"] + m["thinking"] for m in d.values())

        calls = sum(m["calls"] for m in d.values())

        print(f"{ts} TOKENS  {calls} calls · {total_in:,} in · {total_out:,} out (incl. thinking)  {d}")

        # ponytail: illustrative paid-tier rates (USD per 1M tokens); free tier = $0. Edit if pricing changes.

        print(f"          cost now: $0 (free tier) · at $0.30/$2.50 per 1M it'd be ${total_in*0.30/1e6 + total_out*2.50/1e6:.4f}")

    elif e.event == "error":

        print(f"{ts} ERROR {d}")





async def main() -> None:

    board = Blackboard()

    session = SessionState(session_id="live", problem_statement=QUESTION)

    queue = board.subscribe("live")

    t = time.perf_counter()

    print(f"QUESTION: {QUESTION}")



    async def printer():

        while True:

            show(time.perf_counter() - t, await queue.get())



    task = asyncio.create_task(printer())

    result = await Orchestrator(board).solve_problem(session)

    await asyncio.sleep(0.1)

    task.cancel()



    print(f"\n=== {result.status} in {time.perf_counter() - t:.0f}s ===")

    if result.summary:

        out = Path(__file__).parent / "last_summary.md"

        out.write_text(result.summary, encoding="utf-8")

        print(f"summary saved -> {out}")





if __name__ == "__main__":

    asyncio.run(main())

