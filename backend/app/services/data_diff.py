"""What changed between two versions of the user's numbers. Computed by code, never by the model."""


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


if __name__ == "__main__":
    d = diff_stats({"revenue": {"last": 500, "trend": "down"}, "staff": {"last": 4, "trend": "flat"}},
                   {"revenue": {"last": 750, "trend": "up"}, "footfall": {"last": 90, "trend": "up"}}, 6, 7)
    assert d["columns"][0] == {"column": "revenue", "before": 500, "after": 750, "change_pct": 50.0,
                               "trend_before": "down", "trend_after": "up"}
    assert d["added_columns"] == ["footfall"] and d["removed_columns"] == ["staff"] and d["changed"]
    assert not diff_stats({"r": {"last": 1, "trend": "up"}}, {"r": {"last": 1, "trend": "up"}}, 3, 3)["changed"]
    print("data_diff self-check ok")
