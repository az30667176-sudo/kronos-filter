"""
visualizer.py — Fan chart showing history + sampled prediction paths.

Left: last ~60 bars of historical close.
Right: all sampled prediction paths (semi-transparent), median bold,
       shaded P5-P95 band, vertical "today" marker.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.figure import Figure


def build_fan_chart(
    ticker: str,
    historical_df: pd.DataFrame,
    historical_ts: pd.Series,
    paths: np.ndarray,
    future_ts: pd.Series,
    prob_up: float | None = None,
    expected_return: float | None = None,
    history_bars: int = 60,
) -> Figure:
    """
    historical_df: DataFrame with column 'close' (at minimum)
    historical_ts: pandas Series of timestamps matching historical_df
    paths: [n_paths, pred_len, 6] (close at index 3)
    future_ts: pandas Series of future timestamps (length pred_len)
    """
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=110)

    # Historical segment (last N bars)
    hist_close = historical_df["close"].values[-history_bars:]
    hist_ts = historical_ts.values[-history_bars:]
    ax.plot(hist_ts, hist_close, color="#e8e8e8", linewidth=1.6, label="Historical close")

    # Prediction paths
    close_paths = paths[:, :, 3]  # [n_paths, pred_len]
    n_paths = close_paths.shape[0]

    for i in range(n_paths):
        ax.plot(future_ts.values, close_paths[i], color="#c9a55a", alpha=0.15, linewidth=0.8)

    # Median path
    median_path = np.median(close_paths, axis=0)
    ax.plot(future_ts.values, median_path, color="#c9a55a", linewidth=2.2, label="Median path")

    # P5-P95 shaded band
    p5 = np.percentile(close_paths, 5, axis=0)
    p95 = np.percentile(close_paths, 95, axis=0)
    ax.fill_between(future_ts.values, p5, p95, color="#c9a55a", alpha=0.12, label="P5-P95 band")

    # "Today" vertical line
    today = pd.to_datetime(hist_ts[-1])
    ax.axvline(today, color="#8888cc", linestyle="--", alpha=0.7, label="Today")

    # Title with key stats
    title = f"{ticker}"
    stats_parts = []
    if prob_up is not None:
        stats_parts.append(f"prob_up {prob_up * 100:.0f}%")
    if expected_return is not None:
        sign = "+" if expected_return >= 0 else ""
        stats_parts.append(f"E[return] {sign}{expected_return * 100:.1f}%")
    if stats_parts:
        title += "  |  " + "  ·  ".join(stats_parts)
    ax.set_title(title, fontsize=13, color="#e8e8e8", pad=12)

    ax.set_xlabel("Date", color="#a0a0a0")
    ax.set_ylabel("Close price", color="#a0a0a0")
    ax.tick_params(colors="#a0a0a0")
    for spine in ax.spines.values():
        spine.set_edgecolor("#2a2a2a")
    ax.grid(alpha=0.15)
    ax.legend(loc="upper left", fontsize=9, framealpha=0.3)
    ax.set_facecolor("#0c0c0c")
    fig.patch.set_facecolor("#0c0c0c")

    fig.autofmt_xdate()
    fig.tight_layout()
    return fig
