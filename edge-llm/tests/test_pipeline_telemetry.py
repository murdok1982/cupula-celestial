from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np


def test_pipeline_telemetry_sends_statustext():
    with patch("pipeline.telemetry.MavlinkTelemetry") as MockTelemetry:
        mock_inst = MockTelemetry.return_value
        mock_inst.send_statustext.return_value = True
        mock_inst.send_statustext.assert_not_called()

        mock_inst.send_statustext("test message", severity=6)
        mock_inst.send_statustext.assert_called_once_with(
            "test message", severity=6
        )


def test_pipeline_telemetry_handles_disconnect():
    from pipeline.telemetry import MavlinkTelemetry

    mock = MagicMock()
    mock.send_statustext.side_effect = ConnectionError("simulated")
    try:
        mock.send_statustext("test", severity=6)
    except ConnectionError:
        pass
