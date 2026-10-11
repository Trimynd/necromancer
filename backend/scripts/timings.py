"""Stage timing table from a run_court log.  python test/timings.py test/run1_simpl.log ..."""
import re
import sys

STAGE = re.compile(r"^\[\s*([\d.]+)s\] ===== (\w+) =====")
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8", errors="replace").read()
    marks = [(m.group(2), float(m.group(1))) for m in map(STAGE.match, text.splitlines()) if m]
    end = re.search(r"=== (\w+) in (\d+)s ===", text)
    total = float(end.group(2)) if end else (marks[-1][1] if marks else 0)
    print(f"\n{path}: {end.group(1) if end else 'UNFINISHED'} in {total:.0f}s")
    for (name, t), nxt in zip(marks, marks[1:] + [("END", total)]):
        print(f"  {name:12} {nxt[1] - t:6.1f}s")
    print(f"  429 rate-limits: {text.count('429 on')}  500 errors: {text.count('500 on')}  "
          f"tool calls: {text.count(' TOOL ')}  sent back: {text.count('SENT BACK')}  timeouts: {text.count('timed out')}")
    tok = re.search(r"TOKENS\s+(.*?)\{", text)
    if tok:
        print(f"  tokens: {tok.group(1).strip()}")
