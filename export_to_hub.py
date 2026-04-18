"""
export_to_hub.py — Bridge to project-secretary's insights-hub.

Reads the latest probability report from ./results/latest.json and
writes a standardized signal markdown to:

    <project-secretary>/workspace/projects/kronos-filter/outputs/kronos-signals.md

This is the third signal source (after kurt-library's fundamental and
investment-platform's quantitative) that feeds into insights-hub.

Usage:
    python export_to_hub.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parent
LATEST = ROOT / "results" / "latest.json"

# Target in sibling project-secretary repo
SECRETARY_OUT = (
    ROOT.parent
    / "project-secretary"
    / "workspace"
    / "projects"
    / "kronos-filter"
    / "outputs"
    / "kronos-signals.md"
)


def _fmt_pct(v: float, sign: bool = False, digits: int = 1) -> str:
    s = f"{v * 100:.{digits}f}%"
    if sign and v > 0 and not s.startswith("+"):
        return f"+{s}"
    return s


def _format_line(t: dict) -> str:
    return (
        f"- **{t['ticker']}**: prob_up {_fmt_pct(t['prob_up'], digits=0)} "
        f"| E[ret] {_fmt_pct(t['expected_return_overall'], sign=True)} "
        f"| E[up]/E[down] {_fmt_pct(t['expected_return_up'], sign=True)} / "
        f"{_fmt_pct(t['expected_return_down'], sign=True)} "
        f"| p5~p95 {_fmt_pct(t['p5'], sign=True)} ~ {_fmt_pct(t['p95'], sign=True)} "
        f"| median {_fmt_pct(t['p50'], sign=True)} "
        f"| max_dd {_fmt_pct(t['expected_max_drawdown'])} "
        f"| conf {t['confidence_label']} (std {t['confidence_std']:.3f})"
    )


def main() -> int:
    if not LATEST.exists():
        print(f"[err] {LATEST} not found. Run `python main.py ...` first.", file=sys.stderr)
        return 1

    report = json.loads(LATEST.read_text(encoding="utf-8"))
    tickers = report.get("tickers", [])
    if not tickers:
        print("[err] No tickers in latest report.", file=sys.stderr)
        return 1

    # Group by signal_category
    groups: dict[str, list[dict]] = {
        "Strong Bullish": [],
        "Bullish": [],
        "Neutral": [],
        "Bearish": [],
        "Strong Bearish": [],
    }
    for t in tickers:
        cat = t.get("signal_category", "Neutral")
        groups.setdefault(cat, []).append(t)

    lines: list[str] = []
    lines.append("---")
    lines.append("project: kronos-filter")
    lines.append("signal_type: probability")
    lines.append(f"updated: {date.today().isoformat()}")
    data_date = (report.get("data_last_date") or "").split("T")[0]
    if data_date:
        lines.append(f"data_date: {data_date}")
    lines.append("format_version: v1")
    cfg = report.get("config", {})
    lines.append(f"model: Kronos-{cfg.get('model_size', 'small')}")
    lines.append(f"lookback: {cfg.get('lookback')}")
    lines.append(f"pred_len: {cfg.get('pred_len')}")
    lines.append(f"sample_count: {cfg.get('samples')}")
    lines.append(f"source: {LATEST.relative_to(ROOT).as_posix()}")
    lines.append("---")
    lines.append("")
    lines.append("# Probability Signals")
    lines.append("")
    lines.append(
        f"> Auto-generated from Kronos Analyzer on "
        f"{report.get('generated_at', '')[:19].replace('T', ' ')}."
    )
    lines.append(
        f"> Model: **Kronos-{cfg.get('model_size')}** | lookback {cfg.get('lookback')} bars "
        f"| pred_len {cfg.get('pred_len')} bars | {cfg.get('samples')} sampled paths."
    )
    lines.append(
        "> These are **model-subjective probabilities** from Kronos. "
        "Not actual real-world probabilities."
    )
    lines.append("")
    lines.append("Category thresholds:")
    lines.append("- **Strong Bullish**: `prob_up ≥ 75%` 且 `p5 > 0`")
    lines.append("- **Bullish**: `prob_up ≥ 60%`")
    lines.append("- **Neutral**: `40% ≤ prob_up < 60%`")
    lines.append("- **Bearish**: `prob_up < 40%`")
    lines.append("- **Strong Bearish**: `prob_up < 25%` 且 `p95 < 0`")
    lines.append("")

    for cat in ("Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"):
        items = groups.get(cat, [])
        if not items:
            continue
        lines.append(f"## {cat}")
        lines.append("")
        # Sort by prob_up desc (within category)
        for t in sorted(items, key=lambda x: x["prob_up"], reverse=True):
            lines.append(_format_line(t))
        lines.append("")

    # Skipped tickers from upstream fetch
    failed = report.get("failed_tickers", [])
    if failed:
        lines.append("## Not Fetched (yfinance failures)")
        lines.append("")
        lines.append(", ".join(failed))
        lines.append("")

    lines.append("## Notes")
    lines.append("")
    lines.append(
        "- This signal is probabilistic, not directional certainty. "
        "A 70% prob_up means 30% of sampled paths ended lower."
    )
    lines.append(
        "- `confidence_label`: 高 (std<0.03) / 中 (0.03-0.07) / 低 (≥0.07). "
        "High confidence means paths agreed with each other — "
        "does NOT mean the model is correct."
    )
    lines.append(
        "- Kronos is stochastic: re-running without a seed will produce slightly different numbers."
    )
    lines.append(f"- Source repo: `kronos-filter` (https://github.com/az30667176-sudo/kronos-filter)")
    lines.append("")

    if not SECRETARY_OUT.parent.exists():
        print(f"[warn] target dir doesn't exist: {SECRETARY_OUT.parent}", file=sys.stderr)
        print(
            "[warn] creating it anyway; make sure project-secretary is cloned at sibling path",
            file=sys.stderr,
        )
    SECRETARY_OUT.parent.mkdir(parents=True, exist_ok=True)
    SECRETARY_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] wrote {SECRETARY_OUT}", file=sys.stderr)
    print(f"[ok] {sum(len(v) for v in groups.values())} tickers in {len([c for c, v in groups.items() if v])} categories", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
