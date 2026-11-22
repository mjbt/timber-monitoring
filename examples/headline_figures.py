"""Reproduce headline figures quoted from the record.

Run from the repository root:  python examples/headline_figures.py
"""
import csv
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median
import math

ROOT = Path(__file__).resolve().parents[1]

SERVICE_FROM = {d: "2026-08-10T11:00:00Z" for d in
                ("MTS-74", "MTS-75", "MTS-76", "MTS-77", "MTS-78", "MTS-79", "MTS-80")}
SERVICE_FROM["MTS-81"] = "2026-09-22T12:50:00Z"   # king post; earlier readings duplicate MTS-77
ROOF = ("MTS-74", "MTS-75", "MTS-76", "MTS-78", "MTS-79", "MTS-81")   # ring, walkway, king post
INTERIOR = ROOF + ("MTS-77",)     # MTS-80 is in the annexe, not the drum


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def ah(t, rh):
    """Absolute humidity, g/m3 (Magnus-Sonntag, as psychro.py)."""
    return 216.7 * 6.112 * math.exp(17.62 * t / (243.12 + t)) * rh / 100 / (273.15 + t)


def dew(t, rh):
    g = math.log(rh / 100) + 17.62 * t / (243.12 + t)
    return 243.12 * g / (17.62 - g)


def load_full():
    """Rows in service with air temperature, RH and probe temperature."""
    start = {d: ts(t) for d, t in SERVICE_FROM.items()}
    out = []
    with open(ROOT / "data" / "raw.csv") as f:
        for r in csv.DictReader(f):
            try:
                t = ts(r["Time"])
                ta, rh = float(r["AirTempC"]), float(r["RH"])
            except (ValueError, KeyError):
                continue
            try:
                tp = float(r["ProbeTempC"])
            except (ValueError, KeyError):
                tp = None
            d = r["Device"]
            if d in start and t >= start[d] and 0 < rh <= 100:
                out.append((t, d, ta, rh, tp))
    return out


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

    full = load_full()
    end = datetime(2026, 11, 15, tzinfo=timezone.utc)

    # Hours when the drum is damp, and whether opening would dry it.
    # Each node is averaged within the hour; the drum is the median of the nodes.
    per = defaultdict(lambda: defaultdict(list))
    for t, d, ta, rh, tp in full:
        if d in INTERIOR and t < end:
            per[t.replace(minute=0, second=0, microsecond=0)][d].append((ta, rh))
    inside = {}
    for h, nodes in per.items():
        ta = median(mean(x[0] for x in v) for v in nodes.values())
        rh = median(mean(x[1] for x in v) for v in nodes.values())
        a = median(mean(ah(*x) for x in v) for v in nodes.values())
        inside[h] = (ta, rh, a)
    wx = defaultdict(list)
    with open(ROOT / "data" / "weather.csv") as f:
        for r in csv.DictReader(f):
            try:
                t, ta, rh = ts(r["Time"]), float(r["AirTempC"]), float(r["RH"])
            except ValueError:
                continue
            wx[t.replace(minute=0, second=0, microsecond=0)].append((ta, rh))
    outside = {h: (mean(x[0] for x in v), mean(x[1] for x in v)) for h, v in wx.items()}
    damp = [h for h, v in inside.items() if v[1] > 70 and h in outside]
    drying = sum(ah(*outside[h]) <= inside[h][2] - 0.5 for h in damp)
    print(f"Hours with drum above 70% RH, 10 Aug to 14 Nov 2026: {len(damp)};"
          f" outside air drier by 0.5 g/m3 or more in {100 * drying / len(damp):.0f}% of them")

    # Condensation at the sarking: days in October when any roof probe reached dew point
    margin = defaultdict(lambda: math.inf)
    for t, d, ta, rh, tp in full:
        if d in ROOF and t.month == 10 and tp is not None:
            margin[t.date()] = min(margin[t.date()], tp - dew(ta, rh))
    wet = sum(m <= 0 for m in margin.values())
    print(f"October 2026 days with a sarking probe at or below dew point: {wet} of {len(margin)}")

    nov = [rh for t, d, rh in rows if t.month == 11 and t < end and d in INTERIOR]
    print(f"Interior mean RH, 1 to 14 Nov 2026: {mean(nov):.0f}%")


if __name__ == "__main__":
    main()
