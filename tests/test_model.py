from datetime import datetime, timezone
from math import exp, isclose

from timber_monitoring.model import clear_sky, fit_first_order, fit_multi

H = 3600.0


def synthetic(k=0.08, c=0.0, hours=168):
    """Interior following a sinusoidal driver with a known first-order lag."""
    from math import sin, pi
    driver = [(i * H, 10 + 5 * sin(2 * pi * i / 24)) for i in range(hours + 1)]
    s = 12.0
    state = [(0.0, s)]
    for i in range(hours):
        d = driver[i][1]
        # exact step for constant driver over the hour
        s = d + (s - d) * exp(-k) + c
        state.append(((i + 1) * H, s))
    return state, driver


def test_first_order_recovers_k():
    state, driver = synthetic(k=0.08)
    k, c = fit_first_order(state, driver)
    # finite-difference estimate of an exact exponential step
    assert isclose(k, 1 - exp(-0.08), rel_tol=0.05)
    assert abs(c) < 0.05


def test_short_record_falls_back():
    k, c = fit_first_order([(0, 1), (H, 2)], [(0, 3), (H, 3)])
    assert isclose(k, 1 / 24) and c == 0


def test_multi_matches_single_with_no_extras():
    state, driver = synthetic(k=0.1)
    fit = fit_multi(state, driver, [])
    k, c = fit_first_order(state, driver)
    assert isclose(fit["k"], k, rel_tol=1e-6)


def test_clear_sky_noon_and_night():
    noon = clear_sky(datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc))
    # solar elevation near 62 degrees at Greenwich midsummer noon
    assert isclose(noon, 0.88, abs_tol=0.02)
    assert clear_sky(datetime(2026, 12, 21, 0, 0, tzinfo=timezone.utc)) == 0
