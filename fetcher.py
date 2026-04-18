"""
fetcher.py — Yahoo Finance OHLCV fetcher for Kronos Analyzer.

Fetches historical OHLCV for a list of tickers. Ensures all tickers share
the SAME date range (required by predict_batch). Gracefully skips failed
tickers without crashing the pipeline.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


@dataclass
class TickerData:
    ticker: str
    df: pd.DataFrame  # columns: open, high, low, close, volume (and amount, filled by Kronos)
    timestamps: pd.Series  # same length as df, pandas datetime


def _download_one(ticker: str, lookback_days: int, interval: str = "1d") -> pd.DataFrame | None:
    """Download a single ticker's OHLCV. Returns None on failure."""
    try:
        # Over-fetch a bit: markets have weekends/holidays, and lookback is in bars.
        # For daily: fetch ~1.5x calendar days to get enough trading bars.
        multiplier = 1.6 if interval == "1d" else 2.0
        period_days = int(lookback_days * multiplier) + 60
        end = datetime.utcnow()
        start = end - timedelta(days=period_days)

        df = yf.download(
            tickers=ticker,
            start=start.date().isoformat(),
            end=end.date().isoformat(),
            interval=interval,
            progress=False,
            auto_adjust=True,
            threads=False,
        )
        if df is None or df.empty:
            return None

        # yfinance multi-index column flatten when single ticker
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

        # Normalize column names to lowercase
        df.columns = [str(c).lower() for c in df.columns]

        needed = ["open", "high", "low", "close", "volume"]
        for col in needed:
            if col not in df.columns:
                logger.warning(f"[{ticker}] missing column {col}; skipping")
                return None

        df = df[needed].dropna()
        if df.empty:
            return None
        return df
    except Exception as exc:
        logger.warning(f"[{ticker}] download failed: {exc}")
        return None


def fetch_aligned(
    tickers: list[str],
    lookback: int,
    interval: str = "1d",
) -> tuple[list[TickerData], list[str]]:
    """
    Fetch OHLCV for all tickers and align them to the same date range.

    Returns:
        (ok_list, failed_list)
        ok_list: TickerData objects all sharing the same date range
        failed_list: tickers that couldn't be downloaded or had too little data
    """
    raw = {}
    failed: list[str] = []
    for t in tickers:
        df = _download_one(t, lookback_days=lookback, interval=interval)
        if df is None or len(df) < lookback:
            failed.append(t)
            continue
        raw[t] = df

    if not raw:
        return [], failed

    # Align to the COMMON date range (intersection of indexes)
    common_idx = None
    for df in raw.values():
        common_idx = df.index if common_idx is None else common_idx.intersection(df.index)

    if common_idx is None or len(common_idx) < lookback:
        # Fall back: drop tickers that can't fill lookback
        logger.warning(
            f"Common date intersection too short ({0 if common_idx is None else len(common_idx)} < {lookback}); "
            "dropping tickers that don't match."
        )
        # If intersection still gives us something usable, keep it
        if common_idx is None:
            return [], tickers

    # Take the LAST `lookback` rows of the common index
    common_idx = common_idx.sort_values()
    common_idx = common_idx[-lookback:]

    result: list[TickerData] = []
    for t, df in raw.items():
        aligned = df.loc[df.index.intersection(common_idx)].sort_index()
        if len(aligned) < lookback:
            failed.append(t)
            continue
        aligned = aligned.tail(lookback).copy()
        aligned.reset_index(inplace=True)
        # yfinance index is named 'Date' for daily data
        ts_col = aligned.columns[0]
        timestamps = pd.to_datetime(aligned[ts_col])
        aligned = aligned[["open", "high", "low", "close", "volume"]]
        result.append(TickerData(ticker=t, df=aligned, timestamps=timestamps))

    return result, failed


def build_future_timestamps(last_ts: pd.Timestamp, pred_len: int, interval: str = "1d") -> pd.Series:
    """Build future timestamps for the prediction horizon. Skips weekends for daily."""
    if interval == "1d":
        # Skip weekends (business days)
        future = pd.bdate_range(start=last_ts + pd.Timedelta(days=1), periods=pred_len)
        return pd.Series(future)
    # Generic: use same frequency as interval
    freq_map = {"1h": "H", "30m": "30min", "15m": "15min", "5m": "5min", "1wk": "W"}
    freq = freq_map.get(interval, "D")
    future = pd.date_range(start=last_ts + pd.Timedelta(minutes=1), periods=pred_len, freq=freq)
    return pd.Series(future)
