"""Reproduce headline figures quoted from the record.

Run from the repository root:  python examples/headline_figures.py
"""
import csv
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]

SERVICE_FROM = {d: "2026-08-10T11:00:00Z" for d in
                ("MTS-74", "MTS-75", "MTS-76", "MTS-77", "MTS-78", "MTS-79", "MTS-80")}
SERVICE_FROM["MTS-81"] = "2026-09-22T12:50:00Z"   # king post; earlier readings duplicate MTS-77
ROOF = ("MTS-74", "MTS-75", "MTS-76", "MTS-78", "MTS-79", "MTS-81")   # ring, walkway, king post
INTERIOR = ROOF + ("MTS-77",)     # MTS-80 is in the annexe, not the drum


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load():
    start = {d: ts(t) for d, t in SERVICE_FROM.items()}
    out = []
    with open(ROOT / "data" / "raw.csv") as f:
        for r in csv.DictReader(f):
            try:
                t, rh = ts(r["Time"]), float(r["RH"])
            except ValueError:
                continue
            d = r["Device"]
            if d in start and t >= start[d]:
                out.append((t, d, rh))
    return out


def main():
    rows = load()
    sep12 = datetime(2026, 9, 13, tzinfo=timezone.utc)
    early = [rh for t, d, rh in rows if t < sep12 and d in INTERIOR]
    roof_early = [rh for t, d, rh in rows if t < sep12 and d in ROOF]
    print(f"Interior mean RH, 10 Aug to 12 Sep 2026: {mean(early):.0f}%  (n={len(early)})")
    print(f"Minimum RH in the roof over the same period: {min(roof_early):.0f}%")

    octo = [rh for t, d, rh in rows if t.month == 10 and d in INTERIOR]
    above = sum(rh > 80 for rh in octo) / len(octo)
    print(f"October 2026 interior readings above 80% RH: {100 * above:.0f}%  (n={len(octo)})")

    # mean of daily means, so the five-minute floor node is not overweighted
    days = defaultdict(lambda: defaultdict(list))
    for t, d, rh in rows:
        if t >= datetime(2026, 9, 22, 13, tzinfo=timezone.utc):
            days[d][t.date()].append(rh)
    dm = {d: mean(mean(v) for v in days[d].values()) for d in ("MTS-81", "MTS-77")}
    print(f"Daily mean RH since 22 Sep 2026: king post {dm['MTS-81']:.0f}%,"
          f" floor slab {dm['MTS-77']:.0f}%")


if __name__ == "__main__":
    main()
