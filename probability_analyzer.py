"""
probability_analyzer.py — Core module.

Given sampled prediction paths per ticker, compute a rich set of
probability metrics. Every metric is kept visible; never collapsed into
a single opaque score.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

# Tunable thresholds (documented at the top for easy adjustment)
CONFIDENCE_HIGH_MAX = 0.03   # std < 0.03 → 高
CONFIDENCE_MED_MAX = 0.07    # 0.03 ≤ std < 0.07 → 中; ≥ 0.07 → 低

# Category thresholds (for kronos-signals.md output to insights-hub)
STRONG_BULLISH_PROB_UP = 0.75
BULLISH_PROB_UP = 0.60
BEARISH_PROB_UP = 0.40
STRONG_BEARISH_PROB_UP = 0.25


@dataclass
class TickerMetrics:
    ticker: str
    initial_close: float
    # Directional probabilities
    prob_up: float
    prob_down: float
    prob_up_5pct: float
    prob_down_5pct: float
    # Magnitude expectations (all as decimal fractions, e.g. 0.052 = +5.2%)
    expected_return_up: float
    expected_return_down: float
    expected_return_overall: float
    # Distribution percentiles (final_return)
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float
    # Path-level risk
    expected_max_drawdown: float  # average worst peak-to-trough within each path
    # Model confidence
    confidence_std: float
    confidence_label: str  # 高 / 中 / 低
    # Signal category for insights-hub
    signal_category: str   # Strong Bullish / Bullish / Neutral / Bearish / Strong Bearish
    # Sample count for transparency
    n_paths: int


def _label_confidence(std: float) -> str:
    if std < CONFIDENCE_HIGH_MAX:
        return "高"
    if std < CONFIDENCE_MED_MAX:
        return "中"
    return "低"


def _signal_category(prob_up: float, p5: float, p95: float) -> str:
    if prob_up >= STRONG_BULLISH_PROB_UP and p5 > 0:
        return "Strong Bullish"
    if prob_up >= BULLISH_PROB_UP:
        return "Bullish"
    if prob_up < STRONG_BEARISH_PROB_UP and p95 < 0:
        return "Strong Bearish"
    if prob_up < BEARISH_PROB_UP:
        return "Bearish"
    return "Neutral"


def _max_drawdown(path_close: np.ndarray) -> float:
    """Worst peak-to-trough drawdown within a single path (as decimal)."""
    if len(path_close) == 0:
        return 0.0
    running_max = np.maximum.accumulate(path_close)
    drawdowns = (path_close - running_max) / running_max
    return float(drawdowns.min())


def analyze_ticker(ticker: str, paths: np.ndarray, initial_close: float) -> TickerMetrics:
    """
    paths: shape [sample_count, pred_len, 6], where last dim is
           [open, high, low, close, volume, amount] in original price scale.
    initial_close: the ticker's last historical close price.
    """
    if paths.ndim != 3:
        raise ValueError(f"[{ticker}] expected 3D paths, got shape {paths.shape}")
    n_paths, pred_len, _ = paths.shape

    close_idx = 3
    close_paths = paths[:, :, close_idx]  # [n_paths, pred_len]
    final_close = close_paths[:, -1]      # [n_paths]
    final_return = (final_close / initial_close) - 1.0

    prob_up = float((final_return > 0).mean())
    prob_down = float((final_return < 0).mean())
    prob_up_5pct = float((final_return > 0.05).mean())
    prob_down_5pct = float((final_return < -0.05).mean())

    # Magnitudes
    up_mask = final_return > 0
    down_mask = final_return < 0
    expected_return_up = float(final_return[up_mask].mean()) if up_mask.any() else 0.0
    expected_return_down = float(final_return[down_mask].mean()) if down_mask.any() else 0.0
    expected_return_overall = float(final_return.mean())

    # Percentiles
    p5, p25, p50, p75, p95 = [float(np.percentile(final_return, q)) for q in (5, 25, 50, 75, 95)]

    # Max drawdown averaged across paths
    drawdowns = np.array([_max_drawdown(close_paths[i]) for i in range(n_paths)])
    expected_max_drawdown = float(drawdowns.mean())

    # Confidence
    confidence_std = float(final_return.std())
    confidence_label = _label_confidence(confidence_std)

    signal_category = _signal_category(prob_up, p5, p95)

    return TickerMetrics(
        ticker=ticker,
        initial_close=float(initial_close),
        prob_up=prob_up,
        prob_down=prob_down,
        prob_up_5pct=prob_up_5pct,
        prob_down_5pct=prob_down_5pct,
        expected_return_up=expected_return_up,
        expected_return_down=expected_return_down,
        expected_return_overall=expected_return_overall,
        p5=p5, p25=p25, p50=p50, p75=p75, p95=p95,
        expected_max_drawdown=expected_max_drawdown,
        confidence_std=confidence_std,
        confidence_label=confidence_label,
        signal_category=signal_category,
        n_paths=n_paths,
    )


def build_dataframe(metrics_list: list[TickerMetrics]) -> pd.DataFrame:
    """Convert list of metrics into DataFrame, sorted by prob_up desc."""
    if not metrics_list:
        return pd.DataFrame()
    rows = [asdict(m) for m in metrics_list]
    df = pd.DataFrame(rows)
    df = df.sort_values("prob_up", ascending=False).reset_index(drop=True)
    return df
