"""
score_predictions.py — Daily backtest scoring job.

Queries Supabase for kronos_predictions where pred_end_date <= today AND scored_at IS NULL.
For each, fetches actual OHLCV from Yahoo v8, computes several accuracy metrics, and writes
them back to the row.

Designed to run daily via GitHub Actions.

Env vars required:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY

Usage:
    python scripts/score_predictions.py
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import requests

try:
    from supabase import create_client
except ImportError:
    print("[err] supabase package not installed. pip install supabase", file=sys.stderr)
    sys.exit(1)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def fetch_yahoo_range(ticker: str, start_date: date, end_date: date) -> list[dict] | None:
    """Fetch daily close prices from Yahoo v8 between start_date and end_date (inclusive)."""
    # Pad the range a bit
    p1 = int(datetime(start_date.year, start_date.month, start_date.day).timestamp())
    p2 = int(datetime(end_date.year, end_date.month, end_date.day).timestamp()) + 86400 * 2
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "period1": p1,
        "period2": p2,
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    }
    headers = {"User-Agent": UA, "Accept": "application/json"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        if r.status_code != 200:
            logger.warning(f"[{ticker}] yahoo HTTP {r.status_code}")
            return None
        data = r.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return None
        r0 = result[0]
        ts = r0.get("timestamp", [])
        indicators = r0.get("indicators", {})
        quote = (indicators.get("quote") or [{}])[0]
        adj = (indicators.get("adjclose") or [{}])[0]
        closes = adj.get("adjclose") or quote.get("close", [])
        if not ts or not closes:
            return None
        out = []
        for t, c in zip(ts, closes):
            if c is None:
                continue
            d = datetime.fromtimestamp(t, tz=timezone.utc).date()
            if start_date <= d <= end_date + timedelta(days=3):
                out.append({"date": d.isoformat(), "close": float(c)})
        return out
    except Exception as exc:
        logger.warning(f"[{ticker}] fetch failed: {exc}")
        return None


def score_prediction(pred: dict, actuals: list[dict]) -> dict | None:
    """
    Compute accuracy scores given a prediction row and actual daily closes.

    Returns None if actual data insufficient.
    """
    initial_close = pred.get("initial_close")
    if initial_close is None or initial_close <= 0:
        return None
    # We need the actual close at (or just after) pred_end_date
    pred_end_date = date.fromisoformat(pred["pred_end_date"])
    # Find the first close on/after pred_end_date
    final_actual = None
    for bar in actuals:
        if date.fromisoformat(bar["date"]) >= pred_end_date:
            final_actual = bar
            break
    # Fallback: use last available
    if final_actual is None and actuals:
        final_actual = actuals[-1]
    if final_actual is None:
        return None

    actual_final_close = final_actual["close"]
    actual_final_return = (actual_final_close / initial_close) - 1.0

    # Build path of daily returns relative to initial_close
    actual_path = [
        {"date": b["date"], "close": b["close"], "return": (b["close"] / initial_close) - 1.0}
        for b in actuals
    ]

    # Scores
    prob_up = pred.get("prob_up")
    p5 = pred.get("p5")
    p25 = pred.get("p25")
    p50 = pred.get("p50")
    p75 = pred.get("p75")
    p95 = pred.get("p95")
    expected_return = pred.get("expected_return_overall")
    confidence_std = pred.get("confidence_std")

    # Direction hit: if model said prob_up > 0.5 and actual went up (or vice versa)
    direction_pred = 1 if (prob_up or 0) > 0.5 else 0
    direction_actual = 1 if actual_final_return > 0 else 0
    hit_direction = direction_pred == direction_actual

    # Coverage: actual within predicted P5-P95?
    in_p5_p95 = (p5 is not None and p95 is not None and p5 <= actual_final_return <= p95)
    in_p25_p75 = (p25 is not None and p75 is not None and p25 <= actual_final_return <= p75)

    # Percentile of actual within predicted distribution (use monotonic p5/p25/p50/p75/p95)
    # Approximate: linear interpolation
    pcts = [(0.05, p5), (0.25, p25), (0.50, p50), (0.75, p75), (0.95, p95)]
    pcts = [(q, v) for q, v in pcts if v is not None]
    pcts.sort(key=lambda x: x[1])
    percentile_of_actual = None
    if len(pcts) >= 2:
        if actual_final_return <= pcts[0][1]:
            percentile_of_actual = pcts[0][0]
        elif actual_final_return >= pcts[-1][1]:
            percentile_of_actual = pcts[-1][0]
        else:
            for i in range(len(pcts) - 1):
                q1, v1 = pcts[i]
                q2, v2 = pcts[i + 1]
                if v1 <= actual_final_return <= v2:
                    frac = (actual_final_return - v1) / (v2 - v1) if v2 > v1 else 0.0
                    percentile_of_actual = q1 + frac * (q2 - q1)
                    break

    # Magnitude error
    magnitude_error = None
    if expected_return is not None:
        magnitude_error = abs(expected_return - actual_final_return)

    # Signed error (direction aware)
    signed_error = None
    if expected_return is not None:
        signed_error = actual_final_return - expected_return

    scores = {
        "hit_direction": hit_direction,
        "in_p5_p95": in_p5_p95,
        "in_p25_p75": in_p25_p75,
        "percentile_of_actual": percentile_of_actual,
        "magnitude_error": magnitude_error,
        "signed_error": signed_error,
        "expected_return_pred": expected_return,
        "actual_final_return": actual_final_return,
        "confidence_std": confidence_std,
    }

    return {
        "actual_final_close": actual_final_close,
        "actual_final_return": actual_final_return,
        "actual_path": actual_path,
        "scores": scores,
    }


def main():
    today = date.today()
    logger.info(f"Scoring job started at {today.isoformat()}")

    # Find unscored predictions whose window has elapsed
    res = (
        sb.table("kronos_predictions")
        .select("id,ticker,initial_close,prob_up,p5,p25,p50,p75,p95,expected_return_overall,confidence_std,data_last_date,pred_end_date,pred_len_bars")
        .is_("scored_at", "null")
        .lte("pred_end_date", today.isoformat())
        .limit(500)
        .execute()
    )
    rows = res.data or []
    logger.info(f"Found {len(rows)} predictions ready to score")

    scored_count = 0
    skipped_count = 0
    failed_count = 0

    for row in rows:
        ticker = row["ticker"]
        data_last_date = date.fromisoformat(row["data_last_date"])
        pred_end_date = date.fromisoformat(row["pred_end_date"])

        logger.info(f"Scoring {ticker} ({row['id'][:8]}): {data_last_date} → {pred_end_date}")

        # Fetch actuals from day after data_last_date to a few days after pred_end_date
        actuals = fetch_yahoo_range(ticker, data_last_date + timedelta(days=1), pred_end_date + timedelta(days=5))
        if not actuals:
            logger.warning(f"[{ticker}] no actuals fetched, skipping")
            failed_count += 1
            time.sleep(0.5)
            continue

        scored = score_prediction(row, actuals)
        if not scored:
            logger.warning(f"[{ticker}] score_prediction returned None, skipping")
            skipped_count += 1
            continue

        # Write back
        patch = {
            "actual_final_close": scored["actual_final_close"],
            "actual_final_return": scored["actual_final_return"],
            "actual_path": scored["actual_path"],
            "scored_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "scores": scored["scores"],
        }
        try:
            sb.table("kronos_predictions").update(patch).eq("id", row["id"]).execute()
            scored_count += 1
        except Exception as exc:
            logger.error(f"[{ticker}] update failed: {exc}")
            failed_count += 1

        # Be nice to Yahoo
        time.sleep(0.3)

    logger.info(
        f"Done. scored={scored_count}, skipped={skipped_count}, failed={failed_count}"
    )


if __name__ == "__main__":
    main()
