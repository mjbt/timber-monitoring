# Data

The record of environmental conditions in and around the Rotunda, Repository Road, Woolwich, from 1 August to 14 November 2026. Rotunda Trust Limited. Licensed CC BY 4.0. Monitoring infrastructure by ThaniumNine.

Times are UTC, ISO 8601. Values are as received from the instruments; calibration offsets are applied in analysis, not here. The live record continues at https://www.rotundatrust.org.uk/rotunda-monitoring.html.

## raw.csv

One row per sensor uplink from the eight Dragino LHT65S-E3 units.

| Column | Meaning |
|---|---|
| Time | Uplink time, UTC |
| Device | MTS-74 to MTS-81 |
| AirTempC | Air temperature, °C |
| RH | Relative humidity, % |
| ProbeTempC | External probe temperature, °C |
| BatteryV | Battery voltage |
| RSSI, SNR, SF, Fcnt | Radio signal strength, signal to noise, spreading factor, frame counter |

| Device | Position | Probe against | In service from |
|---|---|---|---|
| MTS-74, 75, 78, 79 | Ring at 5 m: south (on truss 21), east, west and south-west | Sarking under the lead | 10 Aug 2026 11:00 |
| MTS-76 | Walkway at 11 m, on truss 21 | Sarking | 10 Aug 2026 11:00 |
| MTS-77 | Floor, centre of the drum | Floor slab | 10 Aug 2026 11:00 |
| MTS-80 | Annexe | Subfloor air (an air reading) | 10 Aug 2026 11:00 |
| MTS-81 | King post at 16 m | Platform | 22 Sep 2026 12:50 |

Readings before each in-service time are co-location and transit, and are excluded from analysis. MTS-81 was held at floor level beside MTS-77 until access to the king post was available. MTS-77 reports every five minutes, the rest every twenty.

## weather.csv

The SenseCAP S2120 station (WST-1) on a post about 8 m above ground in the lee of the building: AirTempC, RH, LightLux, UVIndex, RainmmH, PressurehPa, RainAccMm and the radio fields. Wind is omitted while the station is at its interim position. Rainfall is best derived from the cumulative RainAccMm; the gauge was disturbed on 10 August 2026 between 07:30 and 09:30.

## metar.csv

Half-hourly METAR from London City Airport (EGLC): wind, direction, temperature, dew point, pressure and the raw report. Over the paired record the site mast reads about 0.13 of the airport wind and the dew points agree within 0.7 K.
