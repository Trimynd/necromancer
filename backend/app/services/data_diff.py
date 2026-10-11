"""What changed between two versions of the user's numbers. Computed by code, never by the model."""

from app.services.spreadsheets import diff_sheets, verdict, verdict_change

MAX_CELLS = 200  # changed cells sent to the UI / council per document


def diff_stats(old: dict, new: dict, old_rows: int = 0, new_rows: int = 0) -> dict:
    columns = []
    for col, n in new.items():
        o = old.get(col)
        if not o:
            continue
        before, after = o["last"], n["last"]
        change = round((after - before) / abs(before) * 100, 1) if before else None
        columns.append({"column": col, "before": before, "after": after, "change_pct": change,
                        # recent (last-3-rows) trend shows "was falling -> now rising"
                        "trend_before": o.get("recent_trend") or o.get("trend"),
                        "trend_after": n.get("recent_trend") or n.get("trend")})
    return {
        "columns": columns,
        "added_columns": [c for c in new if c not in old],
        "removed_columns": [c for c in old if c not in new],
        "rows_before": old_rows, "rows_after": new_rows,
        "changed": bool([c for c in columns if c["before"] != c["after"] or c["trend_before"] != c["trend_after"]])
                   or old_rows != new_rows or set(old) != set(new),
    }


def _as_sheet(doc: dict) -> list[dict]:
    t = doc.get("table") or {}
    return [{"sheet": doc.get("name", "data"), "rows": [t.get("columns") or [], *(t.get("rows") or [])]}]


def diff_docs(old: dict, new: dict) -> dict:
    """Old vs new version of one document: column stats, every changed cell, and how the
    code-computed verdict moved. Works for CSV, Excel and Google Sheet documents."""
    t_old, t_new = old.get("table") or {}, new.get("table") or {}
    out = {"name": new["name"], "previous_name": old.get("name"),
           "version_before": int(old.get("version") or 1), "version_after": int(new.get("version") or 2),
           **diff_stats(old.get("stats") or {}, new.get("stats") or {},
                        len(t_old.get("rows") or []), len(t_new.get("rows") or []))}
    if t_old and t_new:
        cells = diff_sheets(_as_sheet(old), _as_sheet(new))
        cells["changes"] = cells["changes"][:MAX_CELLS]
        out["cells"] = cells
        out["changed"] = out["changed"] or cells["total_changed"] > 0
    elif not (t_old or t_new):  # PDFs / notes: no numbers to diff, but a new file is a change
        out["changed"] = old.get("chars") != new.get("chars") or old.get("name") != new.get("name")
    if old.get("ledger") and new.get("financials"):
        # judge the new numbers against the old ones, like the Compare page does (year-over-year when periods differ)
        new_v = verdict(new["financials"], prior=old.get("financials"))
        out["verdict"] = verdict_change(old["ledger"], new_v)
    return out


if __name__ == "__main__":
    d = diff_stats({"revenue": {"last": 500, "trend": "down"}, "staff": {"last": 4, "trend": "flat"}},
                   {"revenue": {"last": 750, "trend": "up"}, "footfall": {"last": 90, "trend": "up"}}, 6, 7)
    assert d["columns"][0] == {"column": "revenue", "before": 500, "after": 750, "change_pct": 50.0,
                               "trend_before": "down", "trend_after": "up"}
    assert d["added_columns"] == ["footfall"] and d["removed_columns"] == ["staff"] and d["changed"]
    assert not diff_stats({"r": {"last": 1, "trend": "up"}}, {"r": {"last": 1, "trend": "up"}}, 3, 3)["changed"]
    print("data_diff self-check ok")
