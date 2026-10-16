"""Unit checks for Leetify-aligned aim metric helpers."""

from __future__ import annotations

import math

from app.services.aim_metrics import _view_angle_delta_deg, _view_at_or_before


def test_view_angle_delta_identical_is_zero() -> None:
    assert _view_angle_delta_deg(0.0, 90.0, 0.0, 90.0) < 1e-6


def test_view_angle_delta_ninety_degrees_yaw() -> None:
    deg = _view_angle_delta_deg(0.0, 0.0, 0.0, 90.0)
    assert abs(deg - 90.0) < 0.5


def test_view_at_or_before_picks_latest() -> None:
    series = [(10, 1.0, 10.0), (20, 2.0, 20.0), (30, 3.0, 30.0)]
    assert _view_at_or_before(series, 25) == (2.0, 20.0)
    assert _view_at_or_before(series, 30) == (3.0, 30.0)
    assert _view_at_or_before(series, 5) is None


def test_view_angle_delta_is_symmetric() -> None:
    a = _view_angle_delta_deg(-5.0, 12.0, 8.0, -40.0)
    b = _view_angle_delta_deg(8.0, -40.0, -5.0, 12.0)
    assert math.isclose(a, b, abs_tol=1e-6)
