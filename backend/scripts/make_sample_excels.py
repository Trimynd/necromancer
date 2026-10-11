"""Build the sample workbooks used to demo Excel upload + compare.

Figures are quarterly consolidated results (₹ crore) as reported in press coverage of each
company's results (Business Standard, Inc42, Entrackr); quarters sum to the reported full-year
totals. A few expense/EBITDA cells are derived where a quarter wasn't reported directly (see
NOTES). The *_whatif file is hypothetical and says so inside the workbook.

    python scripts/make_sample_excels.py            # -> ../frontend/public/samples/
    python scripts/make_sample_excels.py some/dir
"""

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

COLUMNS = ["Period", "Revenue (₹ Cr)", "Total Expenses (₹ Cr)", "Net Profit (₹ Cr)", "Adjusted EBITDA (₹ Cr)",
           "Customers (M)"]

# period, revenue, expenses, net profit, EBITDA, customers (None = not reported)
DATA = {
    "zomato": {
        "name": "Zomato (Eternal Ltd)",
        "customers": "Food delivery avg monthly transacting customers, millions",
        "FY2023": [("Q1 FY23", 1414, 1721, -186, -150, None), ("Q2 FY23", 1661, 2091, -251, -192, 17.5),
                   ("Q3 FY23", 1948, 2485, -347, -265, None), ("Q4 FY23", 2056, 2431, -188, -175, 16.6)],
        "FY2024": [("Q1 FY24", 2416, 2464, 2, 12, 17.5), ("Q2 FY24", 2848, 3039, 36, 41, 18.4),
                   ("Q3 FY24", 3288, 3383, 138, 125, 19.0), ("Q4 FY24", 3562, 3636, 175, 194, 19.0)],
        "sources": ["https://www.business-standard.com/amp/companies/results/zomato-trims-q4-to-rs-187-6-cr-revenue-soars-70-yoy-to-rs-2-056-cr-123051900984_1.html",
                    "https://www.business-standard.com/amp/companies/results/zomato-q4-results-consolidated-profit-at-rs-175-crore-revenue-up-73-124051300785_1.html",
                    "https://inc42.com/buzz/zomato-q3-profit-nearly-quadruples-qoq-to-inr-138-cr"],
        "notes": "Q1/Q3 FY23 expenses are the year-ago figures quoted in FY24 releases; Q3/Q4 FY23 EBITDA derived "
                 "from reported YoY change.",
    },
    "paytm": {
        "name": "Paytm (One97 Communications)",
        "customers": "Avg monthly transacting users (MTU), millions",
        "FY2024": [("Q1 FY24", 2342, 2800, -358, 84, 92), ("Q2 FY24", 2519, 2937, -292, 153, 95),
                   ("Q3 FY24", 2850, 3216, -222, 219, 100), ("Q4 FY24", 2267, 2691, -550, 103, 96)],
        "FY2025": [("Q1 FY25", 1502, 2476, -840, -545, 78), ("Q2 FY25", 1660, 2245, 930, -186, 71),
                   ("Q3 FY25", 1828, 2220, -208, -41, 70), ("Q4 FY25", 1912, 2155, -545, 81, 72)],
        "sources": ["https://www.business-standard.com/companies/results/paytm-q4-results-loss-widens-to-rs-549-60-cr-revenue-falls-2-6-124052200375_1.html",
                    "https://entrackr.com/2024/07/paytm-reports-rs-1501-6-cr-revenue-and-rs-840-cr-loss-in-q1-fy25",
                    "https://www.business-standard.com/companies/results/paytm-q3-fy25-results-losses-narrow-to-rs-208-3-cr-revenue-declines-36-125012000330_1.html"],
        "notes": "EBITDA before ESOP cost. Q2 FY25 profit includes a ~₹1,345 Cr one-off gain (ticketing sale); "
                 "Q4 FY25 loss includes a ₹522 Cr one-off ESOP charge. Q1 FY24 expenses derived from the FY total.",
    },
    "nykaa": {
        "name": "Nykaa (FSN E-Commerce Ventures)",
        "customers": "Not reported quarterly",
        "FY2025": [("Q1 FY25", 1746, 1731, 13.6, 96.1, None), ("Q2 FY25", 1875, 1859, 13.0, 103.7, None),
                   ("Q3 FY25", 2267, 2228, 26.4, 140.8, None), ("Q4 FY25", 2062, 2031, 19.1, 133, None)],
        "sources": ["https://www.business-standard.com/amp/companies/results/nykaa-q1fy25-results-net-profit-jumps-to-rs-14-crore-revenue-up-23-124081301163_1.html",
                    "https://inc42.com/buzz/nykaa-q3-profit-zooms-51-to-inr-26-cr",
                    "https://inc42.com/buzz/nykaa-q4-profit-more-than-doubles-yoy-to-inr-19-1-cr"],
        "notes": "Reported consolidated EBITDA; net profit is total PAT incl. minority interest.",
    },
}

WHATIF_COST_UP = 0.03  # Nykaa what-if: expenses +3%, profit lower by the same amount


def _whatif(rows):
    out = []
    for period, rev, exp, profit, ebitda, cust in rows:
        extra = round(exp * WHATIF_COST_UP)
        out.append((period, rev, exp + extra, round(profit - extra, 1), round(ebitda - extra, 1), cust))
    return out


def build(company: str, fy: str, rows, out: Path, suffix: str = "", note: str = "") -> Path:
    info = DATA[company]
    wb = Workbook()
    ws = wb.active
    ws.title = "Financials"
    ws.append(COLUMNS)
    for r in rows:
        ws.append(list(r))
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0F766E")
    for col, width in zip("ABCDEF", (12, 16, 22, 18, 22, 15)):
        ws.column_dimensions[col].width = width

    about = wb.create_sheet("About")
    about.append(["Field", "Value"])
    for field, value in (("Company", info["name"]), ("Fiscal year", fy), ("Units", "₹ crore, consolidated, quarterly"),
                         ("Customers column", info["customers"]), ("Notes", note or info["notes"]),
                         ("Sources", "\n".join(info["sources"]))):
        about.append([field, value])
    about.column_dimensions["A"].width, about.column_dimensions["B"].width = 18, 110
    for c in about[1]:
        c.font = Font(bold=True)

    path = out / f"{company}_{fy.lower()}{suffix}.xlsx"
    wb.save(path)
    return path


def main(out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = [build(c, fy, DATA[c][fy], out) for c, fy in
             (("zomato", "FY2023"), ("zomato", "FY2024"), ("paytm", "FY2024"), ("paytm", "FY2025"), ("nykaa", "FY2025"))]
    paths.append(build("nykaa", "FY2025", _whatif(DATA["nykaa"]["FY2025"]), out, "_whatif",
                       note=f"HYPOTHETICAL what-if, not reported figures: expenses +{WHATIF_COST_UP:.0%} vs reported, "
                            "net profit and EBITDA lowered by the same amount."))
    return paths


if __name__ == "__main__":
    default = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples"
    for p in main(Path(sys.argv[1]) if len(sys.argv) > 1 else default):
        print(p)
