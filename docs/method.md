# Method

Rotunda Trust Limited, 2026. Licensed CC BY 4.0. The full account is the technical note in `paper/`.

## Instruments

Eight multi-sensor units (Dragino LHT65S-E3) measure air temperature, relative humidity and, by an external probe, the temperature of a solid surface beside them. A weather station (SenseCAP S2120) records outside conditions. All report over LoRaWAN to a gateway on site and every reading is kept in an append-only record. A second outside stream comes from the METAR at London City Airport (EGLC), 2.5 km north at standard exposure.

## Calibration

The instruments were co-located before installation and their offsets computed against the group mean over settled night hours. The spread is 0.47 °C in air temperature, 2.1 points of relative humidity and 0.26 °C on the probes, within the manufacturer's specification. Propagated through the relations below, this is about ±0.5 K in derived dew point and so in the condensation margin; differences between positions smaller than that are not significant. Offsets are applied in analysis, not to the published series, and are not included here. The co-location readings are the rows of `data/raw.csv` before 10 August 2026, so the offsets can be recomputed.

## Derived quantities

Each unit reports air temperature T, relative humidity RH and surface temperature Ts. Everything else is derived with the Magnus form and the coefficients of Sonntag (`psychro.py`):

```
es(T)  = 6.112 · exp[17.62 T / (243.12 + T)]          hPa
AH     = 216.7 · es(T) · RH / 100 / (273.15 + T)       g/m³
γ      = ln(RH / 100) + 17.62 T / (243.12 + T)
Td     = 243.12 γ / (17.62 − γ)                        °C
ΔTcond = Ts − Td(T, RH)                                K
RHs    = 100 · es(T) · RH / 100 / es(Ts)               %
```

A margin of zero means the surface is at the dew point of the adjacent air and begins to wet. Because humidity at a surface rises as the surface cools, mould thresholds are reached before the margin reaches zero, so a positive margin alone is not enough over sustained periods. RHs is the humidity in the air layer at the surface; the mould line is taken at 80 per cent, following the isopleth approach of Sedlbauer.

The sign of the difference in vapour concentration between outside and inside gives the direction in which any exchange of air would move the interior. Seasonal trend is the 30-day central moving average of the daily mean, in accordance with BS EN 15757.

## Projection

Each interior quantity S is treated as a first-order lag on an outside driver D, with further driving terms X:

```
dS/dt = k (D − S) + Σ b_i X_i + c
```

The couplings are fitted by least squares on the trailing seven days and refitted on every page load (`model.py`; `fitK` and `fitMulti` in `web/rotunda-monitoring.js`). Interior temperature is driven by outside temperature with a lagged solar term from the clear-sky elevation at the site. Fabric temperature carries a further term for radiative loss to a clear night sky, with cloud from the airport behind the present and from the forecast ahead of it. Interior humidity is carried as the slow variable, drawn toward the level the outside air's daily-mean vapour would set at the interior temperature. The solar lag is chosen by day-ahead skill rather than residual fit: the residual prefers about an hour, the day-ahead test a lag near twelve hours.

Archived forecasts for 30 July to 9 August 2026 compared with the station over 194 hours gave a temperature bias of +0.48 K and mean absolute error 1.86 K, and a humidity bias of −5.0 points with error 6.0. The site runs about 1 K colder than London City Airport from late afternoon to early morning and the same at midday, while dew points agree within 0.5 K, so airport temperatures overstate the site at night, the hours when condensation forms. Forecasts are fetched live and not kept; archiving each forecast as issued would allow its errors to be checked by season and time of day. The model describes the building in its present fixed state, empty and unheated; any change to openings, heating or occupancy invalidates the couplings until refitted.

## Sources

T. Padfield, The Role of Absorbent Building Materials in Moderating Changes of Relative Humidity (DTU, 1998) and https://www.conservationphysics.org. D. Camuffo, Microclimate for Cultural Heritage, 3rd edn (Elsevier, 2019). K. Sedlbauer, on mould growth prediction and isopleth methods (Fraunhofer IBP, 2001). O. Sonntag, Important new values of the physical constants of 1986, vapour pressure formulations based on the ITS-90, and psychrometer formulae, Z. Meteorol. 40 (1990). BS EN 15757:2010; BS EN 15758:2010; BS EN 16242:2012; BS EN 15759-1:2011; PAS 198:2012.
