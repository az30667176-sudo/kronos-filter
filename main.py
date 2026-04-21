"""
main.py — CLI entry point for Kronos Analyzer.

Usage:
    python main.py --tickers AAPL,MSFT,NVDA --lookback 400 --pred_len 30 --samples 30

Outputs:
    - Prints probability table to console
    - Saves fan charts to ./output/{ticker}_fan.png
    - Saves full metrics to ./output/analysis_{timestamp}.csv
    - Saves JSON results to ./results/{timestamp}-probability-report.json
      (consumed by Next.js frontend)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

# Ensure UTF-8 stdout on Windows (so 高/中/低 can be printed)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import numpy as np
import pandas as pd

# Make sibling modules importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetcher import fetch_aligned, build_future_timestamps
from predictor import KronosPathsPredictor
from probability_analyzer import analyze_ticker, build_dataframe, TickerMetrics
from visualizer import build_fan_chart

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
RESULTS_DIR = ROOT / "results"


def parse_args():
    p = argparse.ArgumentParser(description="Kronos probabilistic stock analyzer")
    p.add_argument("--tickers", required=True, help="Comma-separated tickers, e.g. AAPL,MSFT")
    p.add_argument("--lookback", type=int, default=400, help="Historical bars (default 400, max 512 for small/base)")
    p.add_argument("--pred_len", type=int, default=30, help="Forecast horizon in bars (default 30)")
    p.add_argument("--samples", type=int, default=30, help="Number of sampled paths (default 30)")
    p.add_argument("--interval", default="1d", help="yfinance interval (default 1d)")
    p.add_argument("--model_size", default="small", choices=["mini", "small", "base"])
    p.add_argument("--T", type=float, default=1.0, help="Sampling temperature")
    p.add_argument("--top_p", type=float, default=0.9, help="Nucleus sampling probability")
    p.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    p.add_argument("--no-charts", action="store_true", help="Skip fan chart generation")
    p.add_argument("--no-sync", action="store_true", help="Skip Supabase sync")
    return p.parse_args()


def _format_row_for_display(r: dict) -> dict:
    """Nicely formatted row for tabular display."""
    return {
        "ticker": r["ticker"],
        "signal": r["signal_category"],
        "prob_up": f"{r['prob_up'] * 100:.0f}%",
        "prob_up_5%": f"{r['prob_up_5pct'] * 100:.0f}%",
        "E[ret]": f"{r['expected_return_overall'] * 100:+.1f}%",
        "E[up]": f"{r['expected_return_up'] * 100:+.1f}%",
        "E[down]": f"{r['expected_return_down'] * 100:+.1f}%",
        "p5": f"{r['p5'] * 100:+.1f}%",
        "p50": f"{r['p50'] * 100:+.1f}%",
        "p95": f"{r['p95'] * 100:+.1f}%",
        "max_dd": f"{r['expected_max_drawdown'] * 100:.1f}%",
        "conf": r["confidence_label"],
    }


def main() -> int:
    args = parse_args()
    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    logger.info(f"Analyzing {len(tickers)} tickers: {', '.join(tickers)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Fetch OHLCV aligned to same range
    logger.info("Fetching OHLCV from yfinance…")
    ok_list, failed = fetch_aligned(tickers, lookback=args.lookback, interval=args.interval)
    if failed:
        logger.warning(f"Failed to fetch {len(failed)}: {', '.join(failed)}")
    if not ok_list:
        logger.error("No tickers produced valid data. Aborting.")
        return 2
    logger.info(f"OK tickers: {len(ok_list)}")

    # Step 2: Load Kronos and run batch prediction
    logger.info(f"Loading Kronos-{args.model_size}…")
    predictor = KronosPathsPredictor(model_size=args.model_size)

    # Build future timestamps for each ticker
    future_ts_list = [
        build_future_timestamps(td.timestamps.iloc[-1], args.pred_len, args.interval)
        for td in ok_list
    ]

    logger.info(
        f"Running inference: lookback={args.lookback}, pred_len={args.pred_len}, "
        f"samples={args.samples}, T={args.T}, top_p={args.top_p}"
    )
    paths_list = predictor.predict_paths(
        df_list=[td.df for td in ok_list],
        x_timestamp_list=[td.timestamps for td in ok_list],
        y_timestamp_list=future_ts_list,
        pred_len=args.pred_len,
        T=args.T,
        top_p=args.top_p,
        sample_count=args.samples,
        verbose=True,
        seed=args.seed,
    )
    logger.info("Inference done.")

    # Step 3: Compute probability metrics per ticker
    metrics_list: list[TickerMetrics] = []
    for td, paths in zip(ok_list, paths_list):
        try:
            m = analyze_ticker(td.ticker, paths, initial_close=float(td.df["close"].iloc[-1]))
            metrics_list.append(m)
        except Exception as exc:
            logger.warning(f"[{td.ticker}] analysis failed: {exc}")

    df = build_dataframe(metrics_list)

    # Step 4: Display table
    display_rows = [_format_row_for_display(r) for r in df.to_dict(orient="records")]
    display_df = pd.DataFrame(display_rows)
    print()
    try:
        from tabulate import tabulate
        print(tabulate(display_df, headers="keys", tablefmt="github", showindex=False))
    except ImportError:
        print(display_df.to_string(index=False))
    print()

    # Step 5: Save CSV
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    csv_path = OUTPUT_DIR / f"analysis_{timestamp}.csv"
    df.to_csv(csv_path, index=False)
    logger.info(f"Saved metrics CSV: {csv_path}")

    # Step 6: Save JSON for Next.js frontend consumption
    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "config": {
            "lookback": args.lookback,
            "pred_len": args.pred_len,
            "samples": args.samples,
            "model_size": args.model_size,
            "interval": args.interval,
            "T": args.T,
            "top_p": args.top_p,
            "seed": args.seed,
        },
        "failed_tickers": failed,
        "data_last_date": ok_list[0].timestamps.iloc[-1].isoformat() if ok_list else None,
        "tickers": [asdict(m) for m in metrics_list],
    }
    # Also attach path summary statistics for frontend fan charts (smaller payload than all paths)
    path_summaries = []
    for td, paths, ts_future in zip(ok_list, paths_list, future_ts_list):
        close_paths = paths[:, :, 3]  # [samples, pred_len]
        path_summaries.append({
            "ticker": td.ticker,
            "history_dates": [d.isoformat() for d in td.timestamps.iloc[-60:]],
            "history_close": td.df["close"].iloc[-60:].tolist(),
            "future_dates": [d.isoformat() for d in ts_future],
            "median_path": np.median(close_paths, axis=0).tolist(),
            "p5_path": np.percentile(close_paths, 5, axis=0).tolist(),
            "p25_path": np.percentile(close_paths, 25, axis=0).tolist(),
            "p75_path": np.percentile(close_paths, 75, axis=0).tolist(),
            "p95_path": np.percentile(close_paths, 95, axis=0).tolist(),
        })
    report["path_summaries"] = path_summaries

    json_path = RESULTS_DIR / f"{timestamp}-probability-report.json"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Saved JSON report: {json_path}")

    # Also write a "latest.json" symlink-like copy for the frontend to always find
    latest_path = RESULTS_DIR / "latest.json"
    latest_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # Step 7: Fan charts
    if not args.no_charts:
        logger.info(f"Generating fan charts to {OUTPUT_DIR}/")
        for td, paths, ts_future, m in zip(ok_list, paths_list, future_ts_list, metrics_list):
            try:
                fig = build_fan_chart(
                    ticker=td.ticker,
                    historical_df=td.df,
                    historical_ts=td.timestamps,
                    paths=paths,
                    future_ts=ts_future,
                    prob_up=m.prob_up,
                    expected_return=m.expected_return_overall,
                )
                out = OUTPUT_DIR / f"{td.ticker}_fan.png"
                fig.savefig(out, bbox_inches="tight", facecolor=fig.get_facecolor())
                import matplotlib.pyplot as plt
                plt.close(fig)
            except Exception as exc:
                logger.warning(f"[{td.ticker}] chart failed: {exc}")

    # Step 8: Sync to Supabase (so /history and /backtest on the website see this run)
    if not args.no_sync:
        try:
            import subprocess
            sync_script = ROOT / "scripts" / "sync_to_supabase.py"
            if sync_script.exists():
                result = subprocess.run(
                    [sys.executable, str(sync_script), str(latest_path)],
                    cwd=str(ROOT),
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if result.returncode == 0:
                    logger.info("Supabase sync OK")
                else:
                    logger.warning(f"Supabase sync non-zero exit: {result.stderr[-200:]}")
        except Exception as exc:
            logger.warning(f"Supabase sync failed (local files still saved): {exc}")

    logger.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
