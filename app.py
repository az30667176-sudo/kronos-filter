"""
app.py — Streamlit interactive UI for ad-hoc analysis.

Run:
    streamlit run app.py
"""
from __future__ import annotations

import io
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetcher import fetch_aligned, build_future_timestamps  # noqa: E402
from predictor import KronosPathsPredictor  # noqa: E402
from probability_analyzer import analyze_ticker, build_dataframe  # noqa: E402
from visualizer import build_fan_chart  # noqa: E402


st.set_page_config(page_title="Kronos Probability Analyzer", layout="wide")


@st.cache_resource(show_spinner=False)
def load_predictor(model_size: str) -> KronosPathsPredictor:
    return KronosPathsPredictor(model_size=model_size)


def _confidence_badge(label: str) -> str:
    mapping = {"高": "🟢 高", "中": "🟡 中", "低": "🔴 低"}
    return mapping.get(label, label)


def _format_number_cols(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    pct_cols = [
        "prob_up", "prob_down", "prob_up_5pct", "prob_down_5pct",
        "expected_return_up", "expected_return_down", "expected_return_overall",
        "p5", "p25", "p50", "p75", "p95", "expected_max_drawdown",
    ]
    for c in pct_cols:
        if c in out.columns:
            out[c] = out[c].apply(lambda x: f"{x * 100:+.1f}%" if c.startswith("expected_return") or c.startswith("p") else f"{x * 100:.0f}%")
    if "confidence_label" in out.columns:
        out["confidence_label"] = out["confidence_label"].apply(_confidence_badge)
    return out


def main():
    st.title("🔮 Kronos Probability Analyzer")
    st.caption(
        "Model-subjective probabilities from Kronos foundation model. "
        "**Not financial advice.** Numbers reflect the model's internal distribution of sampled paths, "
        "not real-world probabilities."
    )

    with st.sidebar:
        st.subheader("Configuration")
        tickers_raw = st.text_area(
            "Tickers (one per line or comma-separated)",
            value="AAPL\nMSFT\nNVDA\nGOOGL\nMETA",
            height=140,
        )
        lookback = st.number_input("Lookback (historical bars)", min_value=50, max_value=512, value=400, step=10)
        pred_len = st.number_input("Prediction length (bars)", min_value=1, max_value=120, value=30, step=1)
        samples = st.number_input("Sample paths", min_value=5, max_value=100, value=30, step=1)
        model_size = st.selectbox("Model size", ["mini", "small", "base"], index=1)
        interval = st.selectbox("Interval", ["1d", "1h", "30m"], index=0)
        T = st.slider("Temperature (T)", 0.1, 2.0, 1.0, 0.1)
        top_p = st.slider("Top-p (nucleus)", 0.1, 1.0, 0.9, 0.05)
        seed_str = st.text_input("Random seed (optional)", value="")
        run = st.button("🚀 Analyze", type="primary", use_container_width=True)

    if not run:
        st.info("Configure parameters in the sidebar and click Analyze.")
        st.stop()

    # Parse tickers (accept both newline and comma separation)
    tickers = []
    for chunk in tickers_raw.replace("\n", ",").split(","):
        t = chunk.strip().upper()
        if t and t not in tickers:
            tickers.append(t)
    if not tickers:
        st.error("Please enter at least one ticker.")
        st.stop()

    seed = None
    if seed_str.strip().isdigit():
        seed = int(seed_str.strip())

    progress = st.progress(0, text="Fetching OHLCV data…")
    ok_list, failed = fetch_aligned(tickers, lookback=int(lookback), interval=interval)
    progress.progress(25, text=f"Fetched {len(ok_list)} / {len(tickers)} tickers")

    if failed:
        st.warning(f"Skipped tickers (insufficient data): {', '.join(failed)}")
    if not ok_list:
        st.error("No tickers produced valid data.")
        st.stop()

    progress.progress(30, text="Loading Kronos model (first time may take minutes)…")
    predictor = load_predictor(model_size)

    future_ts_list = [
        build_future_timestamps(td.timestamps.iloc[-1], int(pred_len), interval)
        for td in ok_list
    ]

    progress.progress(50, text="Running Kronos inference…")
    paths_list = predictor.predict_paths(
        df_list=[td.df for td in ok_list],
        x_timestamp_list=[td.timestamps for td in ok_list],
        y_timestamp_list=future_ts_list,
        pred_len=int(pred_len),
        T=float(T),
        top_p=float(top_p),
        sample_count=int(samples),
        verbose=False,
        seed=seed,
    )
    progress.progress(85, text="Computing probability metrics…")

    metrics_list = []
    for td, paths in zip(ok_list, paths_list):
        try:
            m = analyze_ticker(td.ticker, paths, initial_close=float(td.df["close"].iloc[-1]))
            metrics_list.append(m)
        except Exception as exc:
            st.warning(f"[{td.ticker}] analysis failed: {exc}")

    df = build_dataframe(metrics_list)
    progress.progress(100, text="Done")
    progress.empty()

    # --- Results ---
    st.subheader("📊 Probability Table")
    st.caption(f"Sorted by `prob_up` desc. All columns visible — click any column header to re-sort.")
    st.dataframe(_format_number_cols(df), use_container_width=True, hide_index=True)

    # Download button
    csv_buf = io.StringIO()
    df.to_csv(csv_buf, index=False)
    st.download_button(
        label="💾 Download raw metrics CSV",
        data=csv_buf.getvalue(),
        file_name="kronos_analysis.csv",
        mime="text/csv",
    )

    st.divider()

    # Fan chart per ticker
    st.subheader("📈 Fan Chart")
    col1, col2 = st.columns([1, 5])
    with col1:
        selected = st.radio(
            "Ticker",
            options=df["ticker"].tolist(),
            index=0,
            label_visibility="collapsed",
        )
    with col2:
        idx = next((i for i, td in enumerate(ok_list) if td.ticker == selected), 0)
        td = ok_list[idx]
        m = next((mm for mm in metrics_list if mm.ticker == selected), None)
        fig = build_fan_chart(
            ticker=td.ticker,
            historical_df=td.df,
            historical_ts=td.timestamps,
            paths=paths_list[idx],
            future_ts=future_ts_list[idx],
            prob_up=m.prob_up if m else None,
            expected_return=m.expected_return_overall if m else None,
        )
        st.pyplot(fig, use_container_width=True)
        if m:
            cols = st.columns(4)
            cols[0].metric("prob_up", f"{m.prob_up * 100:.0f}%")
            cols[1].metric("E[return]", f"{m.expected_return_overall * 100:+.1f}%")
            cols[2].metric("P5 / P95", f"{m.p5 * 100:+.1f}% / {m.p95 * 100:+.1f}%")
            cols[3].metric("Confidence", _confidence_badge(m.confidence_label))


if __name__ == "__main__":
    main()
