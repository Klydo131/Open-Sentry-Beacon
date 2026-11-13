"""Weekly trends for a Hope Beacon church, from counts that cannot name anyone.

    pip install -r requirements.txt
    TRENDS_DATABASE_URL='postgresql://...' python trends.py     # your church
    python trends.py --demo                                     # invented numbers

It reads one thing: the view trends.weekly
(supabase/migrations/20261027160000_trends_in_counts_only.sql), as the role
beacon_trends, which can read nothing else. A count from 1 to 4 arrives empty
and is shown as "fewer than 5"; that rule is in the database, so nothing here
can get around it. README.md says how to give the role a password and where
the connection string comes from. The string stays on your computer: it is read
from the environment and never printed or written down.

Writes into ./trends-out (or --out):
    weekly.csv     every week, every number, "fewer than 5" where hidden
    summary.txt    the last four weeks against the four before, and the trend
    charts/*.png   one chart per church and measure (needs matplotlib)
"""
from __future__ import annotations

import argparse
import csv
import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

MEASURES = [
    ("people_joined", "People who joined"),
    ("pairs_started", "Guide and Explorer pairs started"),
    ("pairs_talking", "Pairs who talked"),
    ("messages", "Messages"),
    ("lessons_finished", "Lessons finished"),
    ("lessons_read", "Lessons read"),
    ("prayer_requests", "Prayer requests"),
    ("meetings", "Meetings planned"),
    ("reports_raised", "Reports raised"),
    ("reports_closed", "Reports closed"),
]
HIDDEN = "fewer than 5"


def hide_small(n: int) -> int | None:
    """The database's rule, for the invented numbers: 1 to 4 is not shown."""
    return None if 1 <= n <= 4 else n


def fetch(url: str, weeks: int) -> list[dict]:
    import psycopg  # only needed for a real church

    columns = ", ".join(m for m, _ in MEASURES)
    with psycopg.connect(url, connect_timeout=15) as conn:
        conn.read_only = True
        rows = conn.execute(
            f"select church, week_starting, {columns} from trends.weekly"
            " where week_starting >= current_date - make_interval(weeks => %s)"
            " order by church, week_starting",
            (weeks,),
        ).fetchall()
    names = ["church", "week_starting"] + [m for m, _ in MEASURES]
    return [dict(zip(names, row)) for row in rows]


def demo_rows(weeks: int = 26, seed: int = 7) -> list[dict]:
    """Two invented churches, numbers that rise and dip, small ones hidden."""
    rng = random.Random(seed)
    monday = date.today() - timedelta(days=date.today().weekday())
    rows = []
    for church, size in (("Grace Demo Church", 1.0), ("Hill Demo Chapel", 0.4)):
        for i in range(weeks):
            week = monday - timedelta(weeks=weeks - 1 - i)
            growth = 1 + i / weeks
            row = {"church": church, "week_starting": week}
            for measure, _ in MEASURES:
                base = {"messages": 60, "lessons_read": 14, "pairs_talking": 8, "prayer_requests": 6,
                        "lessons_finished": 5, "meetings": 4, "people_joined": 3, "pairs_started": 2,
                        "reports_raised": 0.3, "reports_closed": 0.3}[measure]
                row[measure] = hide_small(max(0, round(rng.gauss(base * size * growth, base * size * 0.3))))
            rows.append(row)
    return rows


def span(values: list[int | None]) -> tuple[int, int]:
    """The total of some weeks, as low and high: a hidden week is 1 to 4."""
    known = sum(v for v in values if v is not None)
    hidden = sum(1 for v in values if v is None)
    return known + hidden, known + 4 * hidden


def say(low: int, high: int) -> str:
    return str(low) if low == high else f"between {low} and {high}"


def slope(values: list[int | None]) -> float | None:
    """How much a measure changes per week (least squares over the weeks shown).

    None when fewer than six weeks are shown: a line through hidden weeks would
    be a guess, and a guess drawn as a line looks like a fact.
    """
    points = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(points) < 6:
        return None
    n = len(points)
    mx = sum(i for i, _ in points) / n
    my = sum(v for _, v in points) / n
    den = sum((i - mx) ** 2 for i, _ in points)
    return 0.0 if den == 0 else sum((i - mx) * (v - my) for i, v in points) / den


def trend_words(s: float | None, usual: float = 0.0) -> str:
    """In words. Steady means changing by less than a quarter a week, or less
    than 1% of the usual week, whichever is more: 2 more messages a week is
    steady in a church that sends 100, and 2 more reports a week is not."""
    if s is None:
        return "too few weeks shown to say"
    if abs(s) < max(0.25, 0.01 * usual):
        return "steady"
    return f"{'rising' if s > 0 else 'falling'} by about {abs(s):.1f} a week"


def by_church(rows: list[dict]) -> dict[str, list[dict]]:
    churches: dict[str, list[dict]] = {}
    for row in rows:
        churches.setdefault(row["church"], []).append(row)
    for weeks in churches.values():
        weeks.sort(key=lambda r: r["week_starting"])
    return churches


def summary(rows: list[dict]) -> str:
    out = [
        "Hope Beacon trends",
        "Weeks start on Monday (UTC). A week with fewer than 5 of something is counted as 1 to 4,",
        "so a total that includes one is given as a range. The trend is over the last 12 weeks,",
        "using only the weeks shown, and is a description of the past, not a forecast.",
    ]
    for church, weeks in by_church(rows).items():
        out += ["", church, "-" * len(church)]
        last4, prev4, last12 = weeks[-4:], weeks[-8:-4], weeks[-12:]
        for measure, label in MEASURES:
            now = say(*span([w[measure] for w in last4]))
            before = f", against {say(*span([w[measure] for w in prev4]))} the 4 weeks before" if prev4 else ""
            shown = [w[measure] for w in last12 if w[measure] is not None]
            trend = trend_words(slope([w[measure] for w in last12]), sum(shown) / len(shown) if shown else 0.0)
            out.append(f"  {label}: {now} in the last 4 weeks{before}; {trend}.")
    return "\n".join(out) + "\n"


def write_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["church", "week_starting"] + [label for _, label in MEASURES])
        for row in rows:
            writer.writerow([row["church"], row["week_starting"]]
                            + [HIDDEN if row[m] is None else row[m] for m, _ in MEASURES])


def charts(rows: list[dict], folder: Path) -> int:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib is not installed, so no charts (pip install -r requirements.txt).")
        return 0
    folder.mkdir(parents=True, exist_ok=True)
    made = 0
    for church, weeks in by_church(rows).items():
        x = [w["week_starting"] for w in weeks]
        for measure, label in MEASURES:
            shown = [w[measure] if w[measure] is not None else 0 for w in weeks]
            # A hidden week is somewhere from 1 to 4, so it is drawn as that band.
            hidden = [3 if w[measure] is None else 0 for w in weeks]
            fig, ax = plt.subplots(figsize=(9, 3.8))
            ax.bar(x, shown, width=5, color="#1e3a5f", label="shown")
            if any(hidden):
                ax.bar(x, hidden, bottom=1, width=5, color="#c9d3df", hatch="//", label="fewer than 5 (1 to 4)")
            ax.set_ylim(bottom=0, top=max(6, max(shown) * 1.1))
            ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, frameon=False)
            ax.set_title(f"{church}: {label}, by week", pad=26)
            ax.spines[["top", "right"]].set_visible(False)
            fig.autofmt_xdate()
            fig.tight_layout()
            safe = "".join(c if c.isalnum() else "-" for c in f"{church}-{measure}").strip("-").lower()
            fig.savefig(folder / f"{safe}.png", dpi=120)
            plt.close(fig)
            made += 1
    return made


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--demo", action="store_true", help="invented numbers, no database")
    parser.add_argument("--out", default="trends-out", help="folder to write into (default: trends-out)")
    parser.add_argument("--weeks", type=int, default=52, help="how many weeks back (default: 52)")
    args = parser.parse_args(argv)

    if args.demo:
        rows = demo_rows(min(args.weeks, 104))
    else:
        url = os.environ.get("TRENDS_DATABASE_URL")
        if not url:
            print("Set TRENDS_DATABASE_URL (README.md says where it comes from), or use --demo.")
            return 2
        rows = fetch(url, args.weeks)
    if not rows:
        print("No weeks to show yet.")
        return 0

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    write_csv(rows, out / "weekly.csv")
    (out / "summary.txt").write_text(summary(rows), encoding="utf-8")
    made = charts(rows, out / "charts")
    print(f"Wrote {out / 'weekly.csv'}, {out / 'summary.txt'} and {made} charts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
