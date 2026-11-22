"""Further findings from the record, 10 August to 14 November 2026.

Run from the repository root:  python examples/further_findings.py
Needs pandas and numpy:        pip install -e .[analysis]

Each block prints one finding quoted in the papers and on the monitoring page.
Interior values are hourly medians across the seven drum nodes; outside values
are the site station; wind and cloud are the London City Airport METAR.
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
END = pd.Timestamp("2026-11-15T00:00Z")
INTERIOR = ["MTS-74", "MTS-75", "MTS-76", "MTS-77", "MTS-78", "MTS-79", "MTS-81"]
RING = ["MTS-74", "MTS-75", "MTS-78", "MTS-79"]
SARKING = RING + ["MTS-76"]
DRUM_VOLUME = np.pi * (34.08 / 2) ** 2 * 12      # m3, inner face of drum, mean height assumed 12 m


def es(t):
    return 6.112 * np.exp(17.62 * t / (243.12 + t))


def ah(t, rh):
    return 216.7 * (rh / 100 * es(t)) / (273.15 + t)


def dew(t, rh):
    g = np.log(rh / 100) + 17.62 * t / (243.12 + t)
    return 243.12 * g / (17.62 - g)


def load():
    raw = pd.read_csv(DATA / "raw.csv")
    raw["Time"] = pd.to_datetime(raw.Time, utc=True, format="ISO8601")
    start = {d: pd.Timestamp("2026-08-10T11:00Z") for d in
             ["MTS-74", "MTS-75", "MTS-76", "MTS-77", "MTS-78", "MTS-79", "MTS-80"]}
    start["MTS-81"] = pd.Timestamp("2026-09-22T12:50Z")
    raw = raw[raw.Device.isin(list(start))]
    raw = raw[(raw.Time >= raw.Device.map(start)) & (raw.Time < END)]
    for c in ["AirTempC", "RH", "ProbeTempC"]:
        raw[c] = pd.to_numeric(raw[c], errors="coerce")
    raw = raw[(raw.RH > 0) & (raw.RH <= 100)].copy()
    raw["AH"] = ah(raw.AirTempC, raw.RH)
    raw["Margin"] = raw.ProbeTempC - dew(raw.AirTempC, raw.RH)
    raw["H"] = raw.Time.dt.floor("h")

    w = pd.read_csv(DATA / "weather.csv")
    w["Time"] = pd.to_datetime(w.Time, utc=True, format="ISO8601")
    w["H"] = w.Time.dt.floor("h")
    wh = w.groupby("H").agg(Tout=("AirTempC", "mean"), RHout=("RH", "mean"), Acc=("RainAccMm", "max"))
    wh["Rain"] = wh.Acc.diff().clip(lower=0)
    wh.loc[wh.Rain > 30, "Rain"] = np.nan            # gauge disturbed 10 August
    wh["AHout"] = ah(wh.Tout, wh.RHout)
    wh["DPout"] = dew(wh.Tout, wh.RHout)

    m = pd.read_csv(DATA / "metar.csv")
    m["Time"] = pd.to_datetime(m.Time, utc=True, format="ISO8601")
    m["H"] = m.Time.dt.floor("h")
    mh = m.groupby("H").agg(U=("RefWindMs", "mean"), Dir=("RefWindDirDeg", "mean"),
                            Tap=("RefTempC", "mean"), DPap=("RefDewC", "mean"))

    pv = raw.groupby(["H", "Device"])[["AirTempC", "RH", "AH", "ProbeTempC", "Margin"]].mean().unstack("Device")
    h = pd.DataFrame(index=pv.index)
    h["Tin"] = pv["AirTempC"][INTERIOR].median(axis=1)
    h["AHin"] = pv["AH"][INTERIOR].median(axis=1)
    h["RHin"] = pv["RH"][INTERIOR].median(axis=1)
    h["Tslab"] = pv["ProbeTempC"]["MTS-77"]
    h["RHfloor"] = pv["RH"]["MTS-77"]
    h["Mmin"] = pv["Margin"][SARKING].min(axis=1)
    h = h.join(wh, how="left").join(mh, how="left").asfreq("h")
    h[["U", "Dir"]] = h[["U", "Dir"]].interpolate(limit=2)
    return raw, h


def main():
    raw, h = load()
    mon = h.index.month
    night = h[h.index.hour < 5]

    print("1. Warmer than outside. Mean night (00-05 UTC) excess over outside air, K:")
    for mo, name in [(8, "Aug"), (9, "Sep"), (10, "Oct"), (11, "Nov to 14th")]:
        s = night[night.index.month == mo]
        print(f"   {name}: drum air {(s.Tin - s.Tout).mean():.1f}, floor slab {(s.Tslab - s.Tout).mean():.1f}")

    print("2. A moisture source. Mean inside minus outside vapour concentration, g/m3,"
          " and share of hours with inside wetter:")
    for mo in [8, 9, 10, 11]:
        s = h[mon == mo]
        print(f"   month {mo}: {(s.AHin - s.AHout).mean():+.2f}, {100 * (s.AHin > s.AHout).mean():.0f}%")

    print("3. Fabric breathing. Daily range of the mean hourly cycle of inside vapour, g/m3,"
          f" and kg of water in a drum of about {DRUM_VOLUME:,.0f} m3:")
    for mo in [8, 9, 10, 11]:
        s = h[mon == mo].groupby(h[mon == mo].index.hour).AHin.mean()
        print(f"   month {mo}: {s.max() - s.min():.1f} g/m3, about {(s.max() - s.min()) * DRUM_VOLUME / 1000:.0f} kg,"
              f" peak at {s.idxmax():02d}:00 UTC")

    print("4. Coupling to outside by wind. Night hours; hourly change in inside vapour"
          " regressed on the inside-outside gap:")
    d = h.copy()
    d["dAH"] = d.AHin.shift(-1) - d.AHin
    d["gap"] = d.AHout - d.AHin
    d = d[(d.index.hour < 6)].dropna(subset=["dAH", "gap", "U"])
    d = d[d.dAH.abs() < 1]
    for lo, hi in [(0, 2), (2, 4), (4, 6), (6, 9)]:
        s = d[(d.U >= lo) & (d.U < hi)]
        k, c = np.linalg.lstsq(np.column_stack([s.gap, np.ones(len(s))]), s.dAH, rcond=None)[0]
        print(f"   airport wind {lo}-{hi} m/s: {k:.3f} of the gap per hour, time constant {1 / k:.0f} h (n={len(s)})")
    k, c = np.linalg.lstsq(np.column_stack([d.gap, np.ones(len(d))]), d.dAH, rcond=None)[0]
    print(f"   with no gap, inside vapour falls {-c:.2f} g/m3 an hour at night as the fabric takes it back")

    print("5. Condensation at the sarking by position: share of readings at or below dew point:")
    names = {"MTS-74": "ring south, truss 21", "MTS-79": "ring south-west", "MTS-75": "ring east",
             "MTS-78": "ring west", "MTS-76": "walkway, truss 21"}
    day = raw[raw.Time.dt.hour.between(11, 16)]
    for dv, nm in names.items():
        s = raw[raw.Device == dv]
        print(f"   {nm}: {100 * (s.Margin <= 0).mean():.1f}%, daytime surface mean"
              f" {day[day.Device == dv].ProbeTempC.mean():.1f} C")
    n = h[h.index.hour < 7].copy()
    nd = n.groupby(n.index.date).agg(M=("Mmin", "min"), U=("U", "mean"))
    nd["cond"] = nd.M <= 0
    calm, windy = nd[nd.U < 2], nd[nd.U >= 2]
    print(f"   nights with condensation: {100 * calm.cond.mean():.0f}% of calm nights (wind under 2 m/s),"
          f" {100 * windy.cond.mean():.0f}% of others")

    print("6. Rain. Change over the six hours after rain begins (at least 1 mm in the hour,"
          " after 12 dry hours):")
    ev = [t for t in h.index if h.Rain.get(t, 0) >= 1
          and h.Rain[t - pd.Timedelta("12h"):t - pd.Timedelta("1h")].sum() < 0.3]
    rows = []
    for t in ev:
        seg = h.loc[t - pd.Timedelta("3h"):t + pd.Timedelta("6h")]
        if len(seg) < 10:
            continue
        b = seg.iloc[:3].mean(numeric_only=True)
        rows.append({"AHin": seg.AHin.iloc[-1] - b.AHin, "AHout": seg.AHout.iloc[-1] - b.AHout,
                     "RHfloor": seg.RHfloor.iloc[-1] - b.RHfloor, "RHin": seg.RHin.iloc[-1] - b.RHin})
    r = pd.DataFrame(rows).mean()
    print(f"   {len(rows)} events: outside vapour {r.AHout:+.2f} g/m3, inside {r.AHin:+.2f} g/m3;"
          f" interior RH {r.RHin:+.1f} points, floor {r.RHfloor:+.1f} points")

    print("7. Site against airport:")
    s = h.dropna(subset=["Tout", "Tap"])
    nt = s[(s.index.hour >= 16) | (s.index.hour < 6)]
    md = s[s.index.hour.isin([9, 10, 11, 12])]
    print(f"   air temperature, site minus airport: night {(nt.Tout - nt.Tap).mean():+.1f} K,"
          f" late morning {(md.Tout - md.Tap).mean():+.1f} K")
    print(f"   dew point, site minus airport: mean {(s.DPout - s.DPap).mean():+.2f} K,"
          f" mean absolute {(s.DPout - s.DPap).abs().mean():.2f} K")


if __name__ == "__main__":
    main()
