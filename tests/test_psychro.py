from math import isclose

from timber_monitoring.psychro import (absolute_humidity, condensation_margin,
                                       dew_point, rh_from_vapour,
                                       saturation_vapour_pressure, surface_rh)


def test_saturation_reference_points():
    # Sonntag values: 6.112 hPa at 0 C, about 23.37 hPa at 20 C
    assert isclose(saturation_vapour_pressure(0), 6.112, abs_tol=1e-9)
    assert isclose(saturation_vapour_pressure(20), 23.37, abs_tol=0.05)


def test_absolute_humidity_20c_50pc():
    # Tabulated value about 8.6 g/m3
    assert isclose(absolute_humidity(20, 50), 8.65, abs_tol=0.05)


def test_dew_point_round_trip():
    for t in (-5, 5, 12, 20):
        for rh in (35, 60, 85, 100):
            td = dew_point(t, rh)
            assert td <= t + 1e-9
            # air at its own dew point is saturated
            assert isclose(surface_rh(td, t, rh), 100, abs_tol=1e-6)


def test_dew_point_known_value():
    # 20 C at 50 % gives a dew point of about 9.3 C
    assert isclose(dew_point(20, 50), 9.26, abs_tol=0.05)


def test_margin_and_surface_rh_agree_in_sign():
    # sanity check against swapped arguments: colder surface, higher surface RH
    m = condensation_margin(8, 12, 70)
    s = surface_rh(8, 12, 70)
    assert m > 0 and 70 < s < 100
    assert condensation_margin(5, 12, 70) < 0 and surface_rh(5, 12, 70) > 100


def test_air_against_surface_example():
    # Strategy note: 79 % in the air is about 95 % at a surface 3 K colder.
    # Exactly 95 near 20 C; a little higher in a colder room.
    assert isclose(surface_rh(17, 20, 79), 95, abs_tol=0.5)
    assert 95 < surface_rh(9, 12, 79) < 97


def test_rh_from_vapour_inverse():
    assert isclose(rh_from_vapour(15, absolute_humidity(15, 63)), 63, abs_tol=1e-9)
