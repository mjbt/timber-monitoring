from timber_monitoring.control import (HeatingController, condition_band,
                                       controlled_value, target_stage,
                                       ventilation_open)


def test_staging_hysteresis():
    assert target_stage(72.9, 0) == 0
    assert target_stage(73.0, 0) == 1
    assert target_stage(75.0, 1) == 1
    assert target_stage(76.0, 1) == 2
    assert target_stage(80.0, 0) == 3
    # falling
    assert target_stage(73.5, 3) == 3
    assert target_stage(73.0, 3) == 2
    assert target_stage(70.0, 2) == 1
    assert target_stage(68.0, 1) == 1
    assert target_stage(67.0, 1) == 0
    assert target_stage(60.0, 3) == 0


def test_quorum_and_staleness():
    now = 100
    latest = {f"n{i}": (now - 5, 70 + i) for i in range(5)}
    rh, live = controlled_value(latest, now)
    assert live == 5 and rh == 72
    latest["n0"] = (now - 30, 70)   # stale
    rh, live = controlled_value(latest, now)
    assert rh is None and live == 4


def test_ventilation_on_absolute_not_relative_humidity():
    # cold saturated outside air is drier than warm damp inside air
    assert ventilation_open(12, 78, 4, 96)
    # warm muggy outside air is wetter even at lower RH
    assert not ventilation_open(12, 78, 18, 70)
    # dry enough inside: no need to vent
    assert not ventilation_open(12, 65, 4, 96)


def test_dwell_and_data_loss():
    c = HeatingController()
    assert c.step(0, 74, 12, 8) == "Low"
    # inside dwell, a further rise is held
    assert c.step(15, 77, 12, 8) == "Low"
    assert c.step(30, 77, 12, 8) == "Medium"
    assert c.kw == 12 and len(c.heaters_on()) == 4
    # data lost: hold for an hour, then off
    assert c.step(45, None, 12, 8) == "Medium"
    assert c.step(105, None, 12, 8) == "Off"
    assert c.alarms


def test_temperature_limit_steps_down():
    c = HeatingController(stage=2, since_min=-60)
    assert c.step(0, 78, 24.0, 15) == "Low"


def test_vent_first():
    c = HeatingController()
    assert c.step(0, 76, 12, 4, vent_available=True, vent_would_dry=True) == "Off"


def test_bands():
    assert condition_band(81).startswith("at or above 80")
    assert condition_band(65) == "below 70 per cent"


def test_seven_heaters_full_output():
    c = HeatingController()
    c.step(0, 80, 12, 8)
    assert c.kw == 21 and len(c.heaters_on()) == 7


def test_forecast_brings_stage_one_early_and_no_higher():
    c = HeatingController()
    # reading below 73 but above the gate; projection reaches 80
    assert c.step(0, 71, 12, 8, forecast_rh_max=80) == "Low"
    c = HeatingController()
    # below the gate: the forecast alone does not call heat
    assert c.step(0, 69, 12, 8, forecast_rh_max=80) == "Off"
    c = HeatingController()
    # no forecast: act on the reading
    assert c.step(0, 71, 12, 8, forecast_rh_max=None) == "Off"
    c = HeatingController()
    # ventilation still comes first
    assert c.step(0, 71, 12, 4, vent_available=True, vent_would_dry=True, forecast_rh_max=80) == "Off"
