"""
sync_to_supabase.py — push results/latest.json into kronos_runs + kronos_predictions.

Lets the local CLI path write to the same database the HF Space + website use,
so /history and /backtest see ALL runs regardless of origin.

Env vars:
    SUPABASE_URL         (or auto-loaded from kronos-analyzer/.env.local)
    SUPABASE_SERVICE_KEY

Usage:
    python scripts/sync_to_supabase.py [path/to/report.json]
    (defaults to ./results/latest.json)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Auto-load credentials from .env.local (repo-local) if present
ENV_FILE = ROOT / ".env.local"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

# Also try frontend/.env.local for NEXT_PUBLIC_SUPABASE_URL fallback
FRONTEND_ENV = ROOT / "frontend" / ".env.local"
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            os.environ.setdefault("SUPABASE_URL", line.split("=", 1)[1].strip())

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

try:
    from supabase import create_client
except ImportError:
    print("[err] pip install supabase==2.9.1", file=sys.stderr)
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error(
        "Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. "
        "Set them in env or in .env.local."
    )
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def build_fingerprint(config: dict, tickers: list[str]) -> str:
    """Must match the TS buildFingerprint() in frontend/lib/supabase.ts."""
    sorted_tickers = sorted(t.upper() for t in tickers)
    parts = [
        "|".join(sorted_tickers),
        f"lb={config.get('lookback')}",
        f"pl={config.get('pred_len')}",
        f"sm={config.get('samples')}",
        f"sd={config.get('seed') if config.get('seed') is not None else 'random'}",
        "mdl=small",
    ]
    return "__".join(parts)


def add_business_days(iso_date: str, days: int) -> str:
    d = datetime.strptime(iso_date, "%Y-%m-%d").date()
    added = 0
    while added < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d.isoformat()


def sync(report_path: Path) -> None:
    if not report_path.exists():
        logger.error(f"{report_path} not found")
        sys.exit(1)
    report = json.loads(report_path.read_text(encoding="utf-8"))

    config = report.get("config", {})
    tickers = [t.get("ticker") for t in report.get("tickers", []) if t.get("ticker")]
    if not tickers:
        logger.warning("no tickers in report; skipping")
        return

    fingerprint = build_fingerprint(config, tickers)

    data_last_date = (report.get("data_last_date") or "")[:10] or None

    # Upsert the run
    run_row = {
        "fingerprint": fingerprint,
        "tickers": tickers,
        "config": config,
        "data_last_date": data_last_date,
        "failed_tickers": report.get("failed_tickers", []),
        "report": report,
    }

    res = (
        sb.table("kronos_runs")
        .upsert([run_row], on_conflict="fingerprint")
        .execute()
    )
    if not res.data:
        logger.error(f"kronos_runs upsert returned no data")
        return
    run_id = res.data[0]["id"]
    logger.info(f"run_id = {run_id}")

    # Clear existing predictions (in case of upsert)
    sb.table("kronos_predictions").delete().eq("run_id", run_id).execute()

    # Build per-ticker prediction rows
    path_summaries = {
        p.get("ticker"): p for p in report.get("path_summaries", []) if p.get("ticker")
    }
    pred_len = int(config.get("pred_len") or 30)

    pred_rows = []
    for m in report.get("tickers", []):
        ticker = m.get("ticker")
        if not ticker:
            continue
        data_last = data_last_date or date.today().isoformat()
        pred_end = add_business_days(data_last, pred_len)
        pred_rows.append({
            "run_id": run_id,
            "ticker": ticker,
            "data_last_date": data_last,
            "pred_len_bars": pred_len,
            "pred_end_date": pred_end,
            "initial_close": m.get("initial_close"),
            "prob_up": m.get("prob_up"),
            "prob_down": m.get("prob_down"),
            "prob_up_5pct": m.get("prob_up_5pct"),
            "prob_down_5pct": m.get("prob_down_5pct"),
            "expected_return_up": m.get("expected_return_up"),
            "expected_return_down": m.get("expected_return_down"),
            "expected_return_overall": m.get("expected_return_overall"),
            "p5": m.get("p5"),
            "p25": m.get("p25"),
            "p50": m.get("p50"),
            "p75": m.get("p75"),
            "p95": m.get("p95"),
            "expected_max_drawdown": m.get("expected_max_drawdown"),
            "confidence_std": m.get("confidence_std"),
            "confidence_label": m.get("confidence_label"),
            "signal_category": m.get("signal_category"),
            "n_paths": m.get("n_paths"),
            "metrics": m,
            "path_summary": path_summaries.get(ticker),
        })

    if pred_rows:
        sb.table("kronos_predictions").insert(pred_rows).execute()

    logger.info(
        f"synced to Supabase: run_id={run_id}, {len(pred_rows)} predictions"
    )


def main() -> int:
    default_path = ROOT / "results" / "latest.json"
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    sync(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
