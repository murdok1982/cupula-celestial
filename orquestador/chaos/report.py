"""Chaos Report — HTML and JSON report generation."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .experiments import ExperimentResult
from .probes import ProbeResult

log = logging.getLogger("chaos.report")

# Colors for HTML report
COLOR_PASS = "#22c55e"
COLOR_FAIL = "#ef4444"
COLOR_WARN = "#f59e0b"
COLOR_BG = "#0f172a"
COLOR_BG2 = "#1e293b"
COLOR_TEXT = "#e2e8f0"
COLOR_MUTED = "#94a3b8"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cúpula Celestial — Chaos Report</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Inter', -apple-system, sans-serif; background: {bg}; color: {text}; padding: 2rem; }}
h1 {{ font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }}
h2 {{ font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }}
.subtitle {{ color: {muted}; font-size: 0.875rem; margin-bottom: 1.5rem; }}
.summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
.card {{ background: {bg2}; border-radius: 0.75rem; padding: 1.25rem; }}
.card .label {{ font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: {muted}; }}
.card .value {{ font-size: 2rem; font-weight: 700; margin-top: 0.25rem; }}
.card .value.pass {{ color: {pass_c}; }}
.card .value.fail {{ color: {fail_c}; }}
.card .value.warn {{ color: {warn_c}; }}
table {{ width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }}
th {{ text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: {muted}; padding: 0.75rem 0.5rem; border-bottom: 1px solid {bg2}; }}
td {{ padding: 0.75rem 0.5rem; border-bottom: 1px solid {bg2}; font-size: 0.875rem; }}
.badge {{ display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }}
.badge.pass {{ background: {pass_c}22; color: {pass_c}; }}
.badge.fail {{ background: {fail_c}22; color: {fail_c}; }}
.mono {{ font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8rem; }}
.timeline {{ display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2rem; }}
.dot {{ width: 1rem; height: 1rem; border-radius: 50%; }}
.dot.pass {{ background: {pass_c}; }}
.dot.fail {{ background: {fail_c}; }}
.probe-detail {{ background: {bg2}; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.5rem; }}
.probe-detail .probe-name {{ font-weight: 600; }}
pre {{ font-size: 0.75rem; color: {muted}; overflow-x: auto; margin-top: 0.5rem; }}
a {{ color: {pass_c}; }}
</style>
</head>
<body>

<h1>🧪 Cúpula Celestial — Chaos Engineering Report</h1>
<p class="subtitle">
  Battery: <strong>{battery_name}</strong> &middot;
  Started: {start_time} &middot;
  Duration: {duration_s:.1f}s &middot;
  Generated: {generated_at}
</p>

<div class="summary-grid">
  <div class="card">
    <div class="label">Experimentos</div>
    <div class="value">{total}</div>
  </div>
  <div class="card">
    <div class="label">PASS</div>
    <div class="value pass">{passed}</div>
  </div>
  <div class="card">
    <div class="label">FAIL</div>
    <div class="value fail">{failed}</div>
  </div>
  <div class="card">
    <div class="label">Pass Rate</div>
    <div class="value {pass_class}">{pass_rate}%</div>
  </div>
  <div class="card">
    <div class="label">Duración Total</div>
    <div class="value">{duration_s:.0f}s</div>
  </div>
  <div class="card">
    <div class="label">Estado Global</div>
    <div class="value {global_class}">{global_status}</div>
  </div>
</div>

<h2>Timeline</h2>
<div class="timeline">
  {timeline_dots}
</div>

<h2>Experimentos</h2>
<table>
<thead>
<tr>
  <th>Experimento</th>
  <th>Descripción</th>
  <th>Duración</th>
  <th>Resultado</th>
  <th>Detalles</th>
</tr>
</thead>
<tbody>
{experiment_rows}
</tbody>
</table>

<h2>Probes — Before</h2>
{probes_before_html}

<h2>Probes — After</h2>
{probes_after_html}

<h2>Métricas Prometheus</h2>
<p class="subtitle">SLOs evaluados durante el chaos run</p>
<table>
<thead>
<tr>
  <th>Métrica</th>
  <th>Threshold</th>
  <th>Estado</th>
</tr>
</thead>
<tbody>
{slo_rows}
</tbody>
</table>

<p class="subtitle" style="margin-top: 2rem;">
  <em>Reporte generado por Cúpula Celestial Chaos Framework v1.0.0</em>
</p>
</body>
</html>"""


class ChaosReport:
    def __init__(
        self,
        experiments_results: list[ExperimentResult],
        start_time: datetime,
        end_time: datetime,
        probes_before: dict[str, ProbeResult] | None = None,
        probes_after: dict[str, ProbeResult] | None = None,
        battery_name: str = "chaos_battery",
        json_path: str | None = None,
    ) -> None:
        self.experiments_results = experiments_results
        self.start_time = start_time
        self.end_time = end_time
        self.probes_before = probes_before or {}
        self.probes_after = probes_after or {}
        self.battery_name = battery_name
        self.json_path = json_path

    def to_dict(self) -> dict[str, Any]:
        return {
            "battery_name": self.battery_name,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "duration_seconds": (
                self.end_time - self.start_time
            ).total_seconds(),
            "experiments": [
                {
                    "name": r.name,
                    "description": r.description,
                    "started_at": r.started_at.isoformat(),
                    "ended_at": r.ended_at.isoformat(),
                    "duration_seconds": r.duration_seconds,
                    "passed": r.passed,
                    "details": r.details,
                    "error": r.error,
                }
                for r in self.experiments_results
            ],
            "probes_before": {
                name: {
                    "passed": p.passed,
                    "details": p.details,
                    "error": p.error,
                }
                for name, p in self.probes_before.items()
            },
            "probes_after": {
                name: {
                    "passed": p.passed,
                    "details": p.details,
                    "error": p.error,
                }
                for name, p in self.probes_after.items()
            },
            "summary": {
                "total": len(self.experiments_results),
                "passed": sum(1 for r in self.experiments_results if r.passed),
                "failed": sum(1 for r in self.experiments_results if not r.passed),
            },
        }

    def to_html(self) -> str:
        total = len(self.experiments_results)
        passed = sum(1 for r in self.experiments_results if r.passed)
        failed = total - passed
        pass_rate = round(passed / total * 100, 1) if total else 0.0
        duration_s = (self.end_time - self.start_time).total_seconds()
        global_passed = passed == total
        global_status = "PASS" if global_passed else "FAIL"

        pass_class = "pass" if pass_rate >= 100 else ("warn" if pass_rate >= 80 else "fail")
        global_pass_class = "pass" if global_passed else "fail"

        timeline_dots = "".join(
            f'<div class="dot {"pass" if r.passed else "fail"}" '
            f'title="{r.name}: {"PASS" if r.passed else "FAIL"}"></div>'
            for r in self.experiments_results
        )

        experiment_rows = "".join(
            f"<tr>"
            f'<td class="mono">{r.name}</td>'
            f"<td>{r.description}</td>"
            f"<td>{r.duration_seconds:.1f}s</td>"
            f'<td><span class="badge {"pass" if r.passed else "fail"}">'
            f'{"PASS" if r.passed else "FAIL"}</span></td>'
            f"<td style='max-width:300px;overflow:hidden;text-overflow:ellipsis;'>"
            f'<span class="mono">{self._truncate(str(r.details.get("errors", r.details)), 150)}</span>'
            f"</td>"
            f"</tr>\n"
            for r in self.experiments_results
        )

        probes_before_html = self._probes_to_html(self.probes_before)
        probes_after_html = self._probes_to_html(self.probes_after)

        slo_rows = (
            """<tr><td>—</td><td>—</td><td><span class="badge pass">No SLOs configurados</span></td></tr>"""
        )

        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        return HTML_TEMPLATE.format(
            bg=COLOR_BG,
            bg2=COLOR_BG2,
            text=COLOR_TEXT,
            muted=COLOR_MUTED,
            pass_c=COLOR_PASS,
            fail_c=COLOR_FAIL,
            warn_c=COLOR_WARN,
            battery_name=self.battery_name,
            start_time=self.start_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
            duration_s=duration_s,
            generated_at=generated_at,
            total=total,
            passed=passed,
            failed=failed,
            pass_rate=pass_rate,
            pass_class=pass_class,
            global_class=global_pass_class,
            global_status=global_status,
            timeline_dots=timeline_dots,
            experiment_rows=experiment_rows,
            probes_before_html=probes_before_html,
            probes_after_html=probes_after_html,
            slo_rows=slo_rows,
        )

    def _probes_to_html(self, probes: dict[str, ProbeResult]) -> str:
        if not probes:
            return '<p class="subtitle">No probes ejecutados</p>'
        html = ""
        for name, pr in probes.items():
            status = "PASS" if pr.passed else "FAIL"
            badge_cls = "pass" if pr.passed else "fail"
            html += (
                f'<div class="probe-detail">'
                f'<span class="probe-name">{name}</span> '
                f'<span class="badge {badge_cls}">{status}</span>'
                f'<pre>{json.dumps(pr.details, indent=2, default=str)[:500]}</pre>'
                f"</div>\n"
            )
        return html

    def _truncate(self, s: str, max_len: int = 200) -> str:
        return s if len(s) <= max_len else s[:max_len] + "..."

    def save(self, output_dir: str | Path) -> Path:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        html_path = output_dir / "chaos_report.html"
        html_path.write_text(self.to_html(), encoding="utf-8")
        log.info("html_report_saved", path=str(html_path))

        json_path = output_dir / "chaos_report.json"
        json_path.write_text(
            json.dumps(self.to_dict(), indent=2, default=str),
            encoding="utf-8",
        )
        self.json_path = str(json_path)
        log.info("json_report_saved", path=str(json_path))

        return html_path
