# Timber monitoring

Monitoring, projection and humidity-led conservation heating for historic timber, developed at the Rotunda, Woolwich.

The Rotunda was designed by John Nash as a tent for the Prince Regent's fête of 1814 and moved to Woolwich Common in 1818–1820, where it was enclosed in a brick drum. It is listed Grade II*. Its conoid roof rests on twenty-four laminated timber trusses, and the purpose of the monitoring is to keep those trusses dry enough to last. Rotunda Trust is a charitable Building Preservation Trust formed to conserve it.

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
| `tests/` | Reference values and behaviour of the control logic |

## Use

```
pip install -e .
python -m pytest
python examples/headline_figures.py
```

```python
from timber_monitoring import dew_point, surface_rh
dew_point(12.0, 78.0)          # 8.28 °C
surface_rh(9.0, 12.0, 79.0)    # 96.5 %: air at 79 % against a surface 3 K colder
```

The Python follows the page script exactly; the tests check it against tabulated values and the JavaScript gives identical figures. The control module describes the strategy and is meant to run in shadow against the record before anything is allowed to switch plant.

## Findings in brief

Interior humidity averaged 54 per cent from installation to 12 September 2026, falling to 31 per cent in the upper roof, then rose into the autumn, with 7 per cent of October readings above 80 per cent. The roof follows the weather within hours; the floor slab and brick drum move slowly and late, and the trusses span between the two. Interior relative humidity follows first the moisture content of the outside air, then outside temperature through the building's slow response. Condensation at the sarking under the lead in cold clear weather is reported, not controlled: it cannot be heated away. Conservation heating runs on humidity.

## Licence

Code is under the MIT licence (`LICENSE`). Text, figures and data are under Creative Commons Attribution 4.0 (`LICENSE-CC-BY-4.0`). Both © 2026 Rotunda Trust Limited, company number 17115816, and a registered charity, number 1220458.

Attribute as: Rotunda Trust, Woolwich Rotunda monitoring record, with monitoring infrastructure by ThaniumNine.

## Credits

Written by Michael Trousdell for Rotunda Trust. Monitoring infrastructure by ThaniumNine. Access to the building by kind support of the Defence Infrastructure Organisation and VINCI Facilities. Cite with `CITATION.cff`.
