# Conservation heating and ventilation: control strategy

Rotunda Trust Limited, 2026. Licensed CC BY 4.0.

This document sets the control intent for temporary conservation heating and ventilation at the Rotunda, Woolwich, and the display intent for its monitoring page. It is written against the sensors in place in autumn 2026. It will need revision when probes move to the structural timber, because the thresholds are set on air humidity and the risk is at the timber surface. The implementation in `src/timber_monitoring/control.py` follows it line by line. It describes the strategy; it is not a tested plant controller.

## How this document is written

The sequences follow ASD-STE100 Simplified Technical English, Issue 9: approved words, one meaning for each word, short sentences and one instruction in each sentence. "Shall" is used for requirements and is a declared exception; STE approves "must". Each sentence is written so that it can be tested.

Each value is written once, in the setpoint schedule, and a sequence cites it by its SP number. Withdrawn SP and SEQ numbers are not used again. The code reads the same values, so a short script can check that the prose and the code agree.

## What is controlled, and what is not

The controlled variable is internal relative humidity. It calls heat in three stages (SEQ-03). The two-day projection of the interior can bring the first stage on early (SEQ-08). Nothing else drives the plant.

Condensation risk is reported and not controlled (SEQ-06). In cold clear weather the sarking under the lead condenses. It has done so since the 1860s, it cannot be heated away, and heat raises the internal vapour pressure that drives moisture to that surface.

The conservation target is the structural timber: the twenty-four principal laminated trusses, their bearings and their bolted junctions. The roof build-up is monitored to explain what the trusses see, not protected in its own right.

## Plant

Seven electric heaters of 3 kW, 21 kW in total, called in three stages.

## Setpoint schedule

| SP | Value | Unit | Basis |
|---|---|---|---|
| SP-01 | 15 | minutes | Decision interval |
| SP-02 | 25 | minutes | A reading older than this is discarded |
| SP-03 | 5 of 8 | nodes | Quorum of live nodes |
| SP-04 | 0.5 | g/m³ | Ventilation margin: outside drier than inside by at least this |
| SP-05 | 70 | % RH | Ventilation gate: below this the building is not opened to dry |
| SP-06 | 73 / 67 | % RH | Stage 1 (Low) on / off: 2 heaters, 6 kW |
| SP-07 | 76 / 70 | % RH | Stage 2 (Medium) on / off: 4 heaters, 12 kW |
| SP-08 | 79 / 73 | % RH | Stage 3 (High) on / off: 7 heaters, 21 kW |
| SP-09 | 30 | minutes | Minimum dwell at a stage, for contactor life |
| SP-10 | 24 | °C | Maximum internal air temperature |
| SP-11 | 5 | K | Maximum lift of internal over outside air temperature |
| SP-12 | 1 | K/h | Maximum rate of setpoint movement |
| SP-13 | 60 | minutes | Hold at the current stage on loss of humidity data |
| SP-14 | 70, 75, 80 | % RH | Reporting bands on the monitoring page |
| SP-15 | 24 | hours | Look-ahead of the interior projection used for early heat |
| SP-16 | 70 | % RH | Early heat only if the reading is already above this |
| SP-17 | +5 | % RH points | Correction to forecast outside humidity, which runs dry (verified 30 July to 9 August 2026: bias −5.0 points) |

## Sequences

### SEQ-01 Measurement and validity

1. The controller shall take a decision at the interval in SP-01.
2. The controller shall use the most recent valid reading from each node.
3. The controller shall discard a reading older than SP-02.
4. The controlled value is the median relative humidity across live nodes.
5. If fewer nodes than SP-03 are live, go to SEQ-07.

A time window is not used, because seven nodes report every twenty minutes and one every five. A window would hold nothing from most of the array.

### SEQ-02 Ventilation

1. Calculate the vapour concentration inside and outside.
2. If the outside air is drier than the inside by more than SP-04, and internal relative humidity is above SP-05, call ventilation open.
3. In all other conditions, call ventilation closed.
4. Do not use relative humidity to compare inside and outside.

Outside air at 96 per cent can be wetter or drier than inside air. Only the vapour concentration shows which. SP-04 prevents hunting at the crossover, which occurs twice a day in autumn.

Critical condition: a humid autumn night, when the crossover occurs.

### SEQ-03 Heating

1. Call stage 1 when relative humidity rises to the on value in SP-06.
2. Call stage 2 when relative humidity rises to the on value in SP-07.
3. Call stage 3 when relative humidity rises to the on value in SP-08.
4. Release each stage when relative humidity falls to its off value.
5. Hold each stage for at least SP-09 before a change.
6. Rotate the heaters at each new call, so that wear is shared.

Each stage has a six-point differential and the stages are three points apart. No stage can reverse unless the building moves.

Critical condition: a cold, damp spell. In that condition all three stages run and relative humidity stays near the stage 3 on value. See the known limits.

### SEQ-04 Priority

1. Test ventilation first.
2. If ventilation is available and would dry the building, do not call heat.
3. Call heat only when ventilation is not available or would add water.

Ventilation dries at no cost. Heat does not. The energy budget is the binding limit before plant capacity is.

### SEQ-05 Limits

1. If internal air temperature reaches SP-10, step down one stage.
2. If internal air is warmer than outside air by SP-11, step down one stage.
3. Move a setpoint by no more than SP-12.
4. Frost protection operates below all other sequences and is independent of them.
5. Raise an alarm at each limit.

### SEQ-06 Report, not control

1. Calculate the margin between each sarking surface temperature and the dew point of the air beside it.
2. Show the worst surface humidity and its margin on the monitoring page.
3. Raise an alarm when a margin is at or below zero.
4. Do not use the margin to call heat.

### SEQ-07 Loss of data

1. If the quorum in SP-03 is lost, hold the current stage for SP-13.
2. If the quorum is not recovered in SP-13, set the plant to Off.
3. Raise an alarm at the start of the hold and again at Off.

### SEQ-08 Act on the forecast

1. Project the interior relative humidity for the next SP-15, from the outside forecast corrected by SP-17.
2. If no stage is called, the projection reaches the on value in SP-06, and the reading is above SP-16, call stage 1.
3. Do not call stage 2 or stage 3 on the forecast.
4. Release the early stage 1 at the off value in SP-06, as in SEQ-03.
5. SEQ-04 applies: if ventilation is available and would dry the building, do not call heat.
6. If no forecast is available, act on the reading only and show that the forecast is missing.

A rise in humidity follows a change in the outside air by hours, and the fabric follows later. Heat brought on early, at stage 1, holds the drum with less swing and less energy than three stages called late after it has wetted.

Critical condition: a damp airmass arriving after a dry spell.

## Criteria

Criteria are defined at named sensors, not across the interior. The drum is stratified and its surfaces move at different speeds, so an average hides the surface where decay begins.

Criteria are in two tiers.

| Tier | What | How judged |
|---|---|---|
| Held to | The controller runs SEQ-01 to SEQ-07 at the scheduled values, logs every decision and raises every alarm | Pass or fail, from the decision log |
| Aimed at | The share of hours within the target band at each named sensor, with an allowance outside it | Against an allowance agreed in advance with the people writing the conservation management plan |

The second tier is not a pass or fail on the plant. Weather and use move the result as much as the plant does. The allowance is not yet agreed. It shall be agreed before the shadow run over the coming winter.

## Intentional behaviours

| Behaviour | Why it looks wrong | Why it is correct |
|---|---|---|
| No heat when the sarking condenses | Water forms and the heaters stay off | Heat raises the vapour pressure at that surface and makes it worse |
| The building is opened on a cold winter day | Cold air comes in | The outside air holds less water than the inside, so opening dries the building |
| Heat stays off in a humid spell | Relative humidity is high and nothing heats | Opening would dry the building, and heat is called only when it would not |
| The page bands (SP-14) are not the switching points | The page shows 75 per cent and no heat runs | The bands describe the building; the switching points are operational detail |
| Stage 1 runs while the reading is below 73 per cent | Heat with no call from the reading | The projection shows the drum will reach 73 per cent within SP-15; early, gentle heat uses less energy than a late, hard call (SEQ-08) |
| Stage 3 is not held on a mild, humid day | Relative humidity is above its on value | The winter energy budget is better spent in cold, damp spells |

## Known limits

| Limit | Consequence |
|---|---|
| Capacity. On assumed geometry the building loses about 5.7 kW/K at 0.5 air changes an hour and 7.5 kW/K at one. Twenty-one kilowatts lifts the interior by at most about 3.7 K at half an air change, and about 2.8 K at one | In a cold, damp spell all three stages run and relative humidity stays near or above 79 per cent. The plant saturates in the conditions it exists for. That is evidence for repairing the roof, windows and floor, not for more heaters |
| Energy. All three stages from 1 November to 31 March would use about 76,000 kWh | A practical winter budget supports a fraction of full output. This is why ventilation is tested first |
| Coupling. With the openings fixed, the interior follows the outside vapour concentration with a time constant of about 39 hours in calm weather and 13 in a strong wind | Ventilation dries the building over days of favourable weather, not hours. The air change rate shall be measured when the openings can be adjusted |
| Forecast. The outside forecast runs about 5 points dry, and archived forecasts were not kept after August 2026 | SEQ-08 depends on SP-17, checked over ten days only. Forecasts shall be archived as issued so that SP-17 can be checked by season. The projection on the monitoring page does not yet apply SP-17 |
| Sarking. On clear nights the lead radiates to the sky and the sarking falls below the dew point | Condensation at the sarking cannot be prevented by the plant. It is reported (SEQ-06) |

## Reporting

The monitoring page shows the bands in SP-14. These are round numbers that describe the state of the building. Eighty per cent is the mould line.

Heating state shows as Off, Low, Medium or High. Ventilation shows as whether opening would help. Until plant is installed, both are labelled as what the strategy calls for, not what is running.

The worst measured surface humidity and its margin are shown with the air figures. Air humidity is the control variable; the surface figure is the risk.
