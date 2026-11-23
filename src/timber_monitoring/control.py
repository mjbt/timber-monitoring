"""Humidity-led conservation heating and ventilation.

An implementation of the outline control strategy in docs/control-strategy.md.
It describes the strategy; it is not a tested plant controller. Run it in
shadow alongside the record before anything is allowed to switch.

The controlled variable is internal relative humidity. Condensation margin is
reported and alarmed, never used to call for heat.
"""
from dataclasses import dataclass, field
from statistics import median

from .psychro import absolute_humidity

# Plant: seven electric heaters of 3 kW, 21 kW in total.
HEATERS = 7
HEATER_KW = 3
# Stages: (name, heaters, rising threshold, falling threshold), per cent RH.
# SP-06 to SP-08 in docs/control-strategy.md.
STAGES = (
    ("Low", 2, 73.0, 67.0),
    ("Medium", 4, 76.0, 70.0),
    ("High", 7, 79.0, 73.0),
)
STAGE_NAMES = ("Off",) + tuple(s[0] for s in STAGES)

VENT_AH_MARGIN = 0.5      # g/m3 drier outside than in before venting
VENT_RH_ABOVE = 70.0      # per cent; below this the building is not ventilated to dry
MAX_INTERNAL_T = 24.0     # degrees C
MAX_LIFT_K = 5.0          # internal not above outside by more than this
MIN_DWELL_MIN = 30        # minutes per stage, for contactor life
STALE_MIN = 25            # a reading older than this is discarded
MIN_LIVE_NODES = 5        # of eight
DATA_LOSS_HOLD_MIN = 60   # hold the current stage this long on loss of data
FORECAST_HORIZON_H = 24   # SP-15: look-ahead of the interior projection
FORECAST_GATE_RH = 70.0   # SP-16: early heat only if the reading is already above this
FORECAST_RH_CORRECTION = 5.0  # SP-17: points added to forecast outside RH, which runs dry


def controlled_value(latest, now_min, stale_min=STALE_MIN, min_live=MIN_LIVE_NODES):
    """Median internal RH across live nodes.

    latest: {node: (time_min, rh)} holding each node's most recent valid reading.
    Returns (median_rh, live_count), or (None, live_count) below the quorum.
    Decisions use each node's latest reading, not a time window, because seven
    nodes report every twenty minutes and one every five.
    """
    live = [rh for (t, rh) in latest.values() if now_min - t <= stale_min]
    if len(live) < min_live:
        return None, len(live)
    return median(live), len(live)


def ventilation_open(in_t, in_rh, out_t, out_rh, margin=VENT_AH_MARGIN, rh_above=VENT_RH_ABOVE):
    """Open only when outside air holds less water than inside by the margin.

    Decided on vapour concentration, never on relative humidity: outside air
    at 96 per cent can be wetter or drier than inside depending on temperature.
    """
    drier_by = absolute_humidity(in_t, in_rh) - absolute_humidity(out_t, out_rh)
    return drier_by > margin and in_rh > rh_above


def target_stage(rh, current):
    """Stage called for by RH with a six-point differential per stage.

    Rising thresholds 73, 76, 79; falling 67, 70, 73. Stages sit three points
    apart, so none can reverse without the building moving.
    """
    stage = current
    # rise through every stage whose rising threshold is met
    while stage < len(STAGES) and rh >= STAGES[stage][2]:
        stage += 1
    # fall through every stage whose falling threshold is crossed
    while stage > 0 and rh <= STAGES[stage - 1][3]:
        stage -= 1
    return stage


@dataclass
class HeatingController:
    """Stateful staging with dwell, limits, data-loss hold and rotation."""
    stage: int = 0
    since_min: float = float("-inf")
    lost_since_min: float = None
    rotation: int = 0
    alarms: list = field(default_factory=list)

    def step(self, now_min, rh, in_t, out_t, vent_available=False, vent_would_dry=False,
             forecast_rh_max=None):
        """Advance one decision (every fifteen minutes). Returns the stage name.

        rh: controlled value from controlled_value(), or None if below quorum.
        forecast_rh_max: highest interior RH in the projection over the next
        FORECAST_HORIZON_H hours, built on forecast outside RH corrected by
        FORECAST_RH_CORRECTION; None if no forecast is available.
        Ventilation is tested first: heat is not called while venting is
        available and would dry the building. The forecast can bring stage 1
        on early (SEQ-08); it never calls a higher stage.
        """
        self.alarms = []
        if rh is None:
            if self.lost_since_min is None:
                self.lost_since_min = now_min
            if now_min - self.lost_since_min >= DATA_LOSS_HOLD_MIN:
                self._set(0, now_min)
                self.alarms.append("humidity data lost: plant off")
            else:
                self.alarms.append("humidity data lost: holding")
            return STAGE_NAMES[self.stage]
        self.lost_since_min = None

        want = target_stage(rh, self.stage)
        if (want == 0 and forecast_rh_max is not None
                and forecast_rh_max >= STAGES[0][2] and rh > FORECAST_GATE_RH):
            want = 1
        if vent_available and vent_would_dry:
            want = 0
        if in_t >= MAX_INTERNAL_T or in_t - out_t >= MAX_LIFT_K:
            want = min(want, max(self.stage - 1, 0))
            self.alarms.append("temperature limit")
        if want != self.stage and now_min - self.since_min < MIN_DWELL_MIN:
            return STAGE_NAMES[self.stage]
        if want != self.stage:
            self._set(want, now_min)
        return STAGE_NAMES[self.stage]

    def _set(self, stage, now_min):
        if stage > self.stage:
            self.rotation = (self.rotation + 1) % HEATERS
        self.stage = stage
        self.since_min = now_min

    @property
    def kw(self):
        return len(self.heaters_on()) * HEATER_KW

    def heaters_on(self):
        """Which of the seven heaters run, rotated so wear is shared."""
        n = 0 if self.stage == 0 else STAGES[self.stage - 1][1]
        return sorted((self.rotation + i) % HEATERS for i in range(n))


def condition_band(rh):
    """Reporting bands on the monitoring page. Deliberately not the switching points."""
    if rh >= 80:
        return "at or above 80 per cent: mould can germinate"
    if rh >= 75:
        return "75 to 80 per cent"
    if rh >= 70:
        return "70 to 75 per cent"
    return "below 70 per cent"
