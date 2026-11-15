"""Moist-air relations used across the Rotunda record.

Magnus form with the coefficients of Sonntag (1990), valid over water from
about -45 to +60 degrees C. These are the relations set out in section 6 of
the technical note and used by the live monitoring page.

Units: temperature in degrees C, relative humidity in per cent, vapour
pressure in hPa, vapour concentration (absolute humidity) in g/m3.
"""
from math import exp, log

A = 17.62
B = 243.12      # degrees C
E0 = 6.112      # hPa at 0 degrees C
RV_FACTOR = 216.7   # 100 / R_v in g K / (m3 hPa), R_v = 461.5 J/(kg K)


def saturation_vapour_pressure(t):
    """Saturation vapour pressure over water, hPa."""
    return E0 * exp(A * t / (B + t))


def vapour_pressure(t, rh):
    """Partial pressure of water vapour, hPa."""
    return saturation_vapour_pressure(t) * rh / 100.0


def saturation_vapour_density(t):
    """Vapour concentration of saturated air, g/m3."""
    return RV_FACTOR * saturation_vapour_pressure(t) / (273.15 + t)


def absolute_humidity(t, rh):
    """Vapour concentration (absolute humidity), g/m3."""
    return saturation_vapour_density(t) * rh / 100.0


def dew_point(t, rh):
    """Dew point of air at t and rh, degrees C."""
    if rh <= 0:
        raise ValueError("relative humidity must be above zero")
    g = log(rh / 100.0) + A * t / (B + t)
    return B * g / (A - g)


def condensation_margin(surface_t, air_t, air_rh):
    """Surface temperature less the dew point of the adjacent air, K.

    Zero means the surface is at the dew point and begins to wet.
    """
    return surface_t - dew_point(air_t, air_rh)


def surface_rh(surface_t, air_t, air_rh):
    """Relative humidity in the air layer at a surface, per cent.

    The vapour pressure of the room air held at the surface temperature.
    Mould thresholds are reached here before the condensation margin reaches
    zero, which is why the surface figure is the risk and the air figure is
    the control variable. Values above 100 mean condensation.
    """
    return 100.0 * vapour_pressure(air_t, air_rh) / saturation_vapour_pressure(surface_t)


def rh_from_vapour(t, ah):
    """Relative humidity of air at t holding vapour concentration ah, per cent."""
    return 100.0 * ah / saturation_vapour_density(t)
