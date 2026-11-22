# Conservation heating and ventilation: control strategy

Rotunda Trust Limited, 2026. Licensed CC BY 4.0.

This sets the control intent for temporary conservation heating at the Rotunda, Woolwich, and the display intent for its monitoring page. It is written against the sensors in place in autumn 2026. It will need revising once probes are relocated to the structural timber, because the thresholds below are set on air humidity and the risk is at the timber surface. The implementation in `src/timber_monitoring/control.py` follows it line by line.

## What is controlled, and what is not

The controlled variable is internal relative humidity, which calls heat in three stages from 73 per cent, as set out below. Nothing else drives the plant.

Condensation risk is reported and not controlled. In cold clear weather the sarking under the lead will condense. It has done so since the 1860s, it cannot be heated away, and attempting it raises the internal vapour pressure driving moisture at that surface. The dew point margin is therefore a reported figure and an alarm, not an input to the heating call.

The conservation target is the structural timber: the twenty-four principal laminated trusses, their bearings and their bolted junctions. The roof build-up is monitored to explain what the trusses see, not protected in its own right.

## Heating

Three electric stages of 7 kW, 21 kW in total, staged on internal relative humidity.

| Rising | Stage | Falling |
|---|---|---|
| 73% | Low, 7 kW | 67% |
| 76% | Medium, 14 kW | 70% |
| 79% | High, 21 kW | 73% |

Each stage carries a six-point differential and the stages sit three points apart, so no stage can reverse without the building moving. Minimum dwell of thirty minutes per stage for contactor life. Stages rotate on each call so wear is shared.

## Ventilation

Open or closed, decided on absolute humidity and nothing else.

Open when the outside vapour concentration is below the inside value by more than 0.5 g/m³ and internal relative humidity is above 70 per cent. Closed otherwise. The 0.5 g/m³ margin prevents hunting across the crossover, which occurs twice a day in autumn.

Relative humidity is not used for this decision. Outside air at 96 per cent can be either wetter or drier than inside depending on temperature, and only the vapour concentration says which.

## Priority

Ventilation is tested first. Heating is called only where venting is unavailable or would add water. Ventilation dries at no cost and heating does not, and the energy available is the binding constraint before plant capacity is.

## Limits and overrides

Internal air temperature not to exceed 24 °C, and not to exceed outside by more than 5 K.

Setpoint movement rate-limited to 1 K per hour.

Frost protection at the bottom, independent of all of the above.

On loss of humidity data the plant holds its current stage for one hour, then drops to Off and raises an alarm.

## Measurement and validity

Decisions are taken every fifteen minutes on the most recent valid reading from each node, not on readings falling inside a fifteen-minute window. Seven of the eight nodes report every twenty minutes and one every five, so a window would contain nothing from most of the array.

A reading older than twenty-five minutes is discarded. At least five of eight nodes must be live. The controlled value is the median across live nodes. Below five live nodes the plant holds and alarms.

## Reporting

The monitoring page shows three condition bands, at 70, 75 and 80 per cent. These are round numbers describing the state of the building and are deliberately not the switching points, which are operational detail. Eighty per cent remains the mould line.

Heating state shows as Off, Low, Medium or High. Ventilation shows as whether venting would help. Until plant is installed both are labelled as what the strategy calls for rather than what is running.

The worst measured surface humidity and its margin are reported alongside the air figures. Air humidity is the control variable; the surface figure is the risk.

## Known limits

Capacity. On assumed geometry the building loses about 5.7 kW/K at 0.5 air changes and 7.5 kW/K at one. Twenty-one kilowatts therefore lifts the interior about 3 K, not 5. In a cold damp spell all three stages will be on and the reading will still sit near or above 79 per cent. The plant saturates in the conditions it exists for. That is evidence for repairing the roof and windows, not an argument for more heaters.

Energy. Three stages running from 1 November to 31 March would take about 76,000 kWh. A practical winter budget supports a fraction of full output, which is why ventilation is tested first and why the third stage should not be spent on mild humid days.

Air against surface. At 79 per cent in the air, a truss surface three degrees colder sits near 95 per cent. The thresholds above are what the plant can chase, not what the timber experiences.

Probe positions. Where a probe reads at or above air temperature it contributes nothing to the surface statistic. Until the mounting record is complete the surface figures rest on an assumption.

## Commissioning

Run in shadow for the first weeks, logging what the strategy would have called for against what actually happened, before anything is allowed to switch. The same trace serves as the web page display, so the commissioning check and the public record are one piece of work.

Calibrate the humidity elements before the strategy goes live. Three points of drift moves every threshold by three points.
