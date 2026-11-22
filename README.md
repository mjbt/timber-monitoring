# Timber monitoring

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24247030.svg)](https://doi.org/10.5281/zenodo.24247030)

Monitoring, projection and humidity-led conservation heating for historic timber, developed at the Rotunda, Woolwich.

The Rotunda was designed by John Nash as a temporary room for the Prince Regent's fête of 1814 and moved to Woolwich in 1818–1820, where it was enclosed in a brick drum. It is listed Grade II*. Its conoid roof rests on twenty-four laminated timber trusses, and the purpose of the monitoring is to keep those trusses dry enough to last. Rotunda Trust is a charitable Building Preservation Trust formed to conserve it.

This repository holds the science behind the live record at https://www.rotundatrust.org.uk/rotunda-monitoring.html: the formulas, the mould and condensation measures, the model that projects the interior two days ahead, the control strategy for conservation heating, and the data.

## Contents

| Path | What it is |
|---|---|
| `src/timber_monitoring/psychro.py` | Vapour pressure, absolute humidity, dew point, condensation margin and surface humidity (Magnus–Sonntag) |
| `src/timber_monitoring/model.py` | First-order response fit, multi-term least squares, clear-sky solar elevation |
| `src/timber_monitoring/control.py` | Staged heating with hysteresis and dwell, ventilation on absolute humidity, node validity and median, limits |
| `web/rotunda-monitoring.js` | The script that runs the live page, unchanged |
| `docs/method.md` | Instruments, calibration, derived quantities and the projection |
| `docs/control-strategy.md` | The conservation heating and ventilation strategy |
| `paper/` | Technical note, What Historic Timber Needs: Live Monitoring and Forecast at the Rotunda |
| `data/` | Sensor, weather station and airport records, 1 August to 14 November 2026, with a data description |
| `examples/headline_figures.py` | Reproduces the figures quoted from the record |
| `examples/further_findings.py` | Reproduces the further findings: heat and moisture balance, fabric cycle, wind coupling, condensation by position, rain, site against airport (needs `pip install -e .[analysis]`) |
| `tests/` | Reference values and behaviour of the control logic |

## Use

```
pip install -e .
python -m pytest
python examples/headline_figures.py
pip install -e .[analysis]
python examples/further_findings.py
```

```python
from timber_monitoring import dew_point, surface_rh
dew_point(12.0, 78.0)          # 8.28 °C
surface_rh(9.0, 12.0, 79.0)    # 96.5 %: air at 79 % against a surface 3 K colder
```

The Python follows the page script exactly; the tests check it against tabulated values and the JavaScript gives identical figures. The control module describes the strategy and is meant to run in shadow against the record before anything is allowed to switch plant.

## Findings in brief

From 10 August to 14 November 2026 the air within the drum ran from 31 to 89 per cent relative humidity. It averaged 50 per cent in August, 62 in September, 70 in October and 76 in the first half of November, with 7 per cent of October readings above 80. The roof follows the weather within hours; the floor slab and brick drum move slowly and late, and the trusses span between the two. Interior relative humidity follows first the moisture content of the outside air, then outside temperature through the building's slow response.

In the hours when the drum was above 70 per cent, the outside air held at least 0.5 g/m³ less water than the inside for about a third of them: opening would have dried the building then, and only heat could do so otherwise. On 9 of October's 31 days the sarking under the lead reached the dew point of the air beside it. That condensation is reported, not controlled: it cannot be heated away. Conservation heating runs on humidity, and in a cold, damp spell the three stages saturate, which is evidence for repairing the roof, windows and floor.

The building has been warmer than the outside air every month, by about 3 K on October and November nights, and the floor slab by about 5 K: stored summer and ground heat that is now running down, so interior humidity will rise further through midwinter. The interior is also a source of moisture. Its air has held more water than the outside air on average in every month, and in 66 per cent of hours in November. After rain the outside air dries while the inside air gains moisture and the floor reading rises, consistent with water coming through the roof onto the floor. The fabric takes up and releases tens of kilograms of water a day, about 40 in August and 10 in November, peaking at 14:00. Wind changes how quickly the interior follows the outside air, with a time constant of about 39 hours in calm weather and 13 in a strong wind, not the level it settles at. Condensation at the sarking is most frequent at the south and south-west of the ring, on truss 21 among them, and on calm nights: 24 per cent of nights with wind under 2 m/s against 7 per cent otherwise. The site runs about 1 K colder than London City Airport at night, with dew points agreeing within 0.5 K.

## Licence

Code is under the MIT licence (`LICENSE`). Text, figures and data are under Creative Commons Attribution 4.0 (`LICENSE-CC-BY-4.0`). Both © 2026 Rotunda Trust Limited, company number 17115816, and a registered charity, number 1220458.

Attribute as: Rotunda Trust, Woolwich Rotunda monitoring record, with monitoring infrastructure by ThaniumNine.

## Credits

Written by Michael Trousdell for Rotunda Trust. Monitoring infrastructure by ThaniumNine. Access to the building by kind support of the Defence Infrastructure Organisation and VINCI Facilities. Cite as https://doi.org/10.5281/zenodo.24247030, which always resolves to the latest version; version 1.0.0 is https://doi.org/10.5281/zenodo.24247031. Details in `CITATION.cff`.
