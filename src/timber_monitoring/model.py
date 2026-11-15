"""The two-day projection: first-order response of the interior to the outside.

Each interior quantity S is treated as a first-order lag on an outside driver
D, with further driving terms X:

    dS/dt = k (D - S) + sum(b_i X_i) + c

fitted by least squares on the trailing week. A Python statement of the
fitting used by web/rotunda-monitoring.js (functions fitK, fitMulti and
clearSky there).
"""
from bisect import bisect_left
from math import cos, pi, sin

SITE_LAT_DEG = 51.478
SITE_LON_DEG = 0.061
HOUR_S = 3600.0


def interp_at(series, x):
    """Linear interpolation in [(x, v), ...] sorted by x; None outside the span."""
    xs = [p[0] for p in series]
    i = bisect_left(xs, x)
    if i == 0 or i >= len(xs):
        return series[0][1] if xs and x == xs[0] else None
    x0, v0 = series[i - 1]
    x1, v1 = series[i]
    return v0 + (v1 - v0) * (x - x0) / (x1 - x0)


def _pairs(state, driver, max_gap_h=3.0):
    for (xa, va), (xb, vb) in zip(state, state[1:]):
        dt = (xb - xa) / HOUR_S
        if dt <= 0 or dt > max_gap_h:
            continue
        d = interp_at(driver, xa)
        if d is None:
            continue
        yield xa, va, d, (vb - va) / dt


def fit_first_order(state, driver):
    """Fit dS/dt = k (D - S) + c. Times in seconds; k returned per hour.

    Falls back to k = 1/24, c = 0 if the record is short or the fit is not
    physical, as the page does.
    """
    xs, ys = [], []
    for _, s, d, rate in _pairs(state, driver):
        xs.append(d - s)
        ys.append(rate)
    n = len(xs)
    if n < 10:
        return 1 / 24, 0.0
    sx, sy = sum(xs), sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    den = n * sxx - sx * sx or 1.0
    k = (n * sxy - sx * sy) / den
    c = (sy - k * sx) / n
    if not (0.002 < k <= 2):
        return 1 / 24, 0.0
    return k, c


def fit_multi(state, driver, extras):
    """Fit dS/dt = c + k (D - S) + sum b_i X_i(t) by normal equations.

    extras: callables of time returning the extra driving terms, or None.
    Returns dict(c, k, b) or None if under-determined.
    """
    rows, ys = [], []
    for x, s, d, rate in _pairs(state, driver):
        vals = [f(x) for f in extras]
        if any(v is None for v in vals):
            continue
        rows.append([1.0, d - s] + vals)
        ys.append(rate)
    w = 2 + len(extras)
    if len(rows) < 20:
        return None
    a = [[sum(r[i] * r[j] for r in rows) for j in range(w)] for i in range(w)]
    b = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(w)]
    for col in range(w):
        piv = max(range(col, w), key=lambda r: abs(a[r][col]))
        if abs(a[piv][col]) < 1e-12:
            return None
        a[col], a[piv] = a[piv], a[col]
        b[col], b[piv] = b[piv], b[col]
        for r in range(w):
            if r != col:
                f = a[r][col] / a[col][col]
                for cc in range(col, w):
                    a[r][cc] -= f * a[col][cc]
                b[r] -= f * b[col]
    sol = [b[i] / a[i][i] for i in range(w)]
    return {"c": sol[0], "k": sol[1], "b": sol[2:]}


def clear_sky(t_utc, lat_deg=SITE_LAT_DEG, lon_deg=SITE_LON_DEG):
    """Sine of solar elevation at the site, zero at night.

    NOAA general solar position (Spencer series for declination and the
    equation of time). t_utc: a datetime in UTC.
    """
    doy = t_utc.timetuple().tm_yday
    g = 2 * pi * (doy - 1 + (t_utc.hour - 12) / 24) / 365
    eot = 229.18 * (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g)
                    - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g))
    dec = (0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g)
           - 0.006758 * cos(2 * g) + 0.000907 * sin(2 * g)
           - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g))
    tst = t_utc.hour * 60 + t_utc.minute + t_utc.second / 60 + eot + 4 * lon_deg
    ha = (tst / 4 - 180) * pi / 180
    lat = lat_deg * pi / 180
    s = sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)
    return max(s, 0.0)
