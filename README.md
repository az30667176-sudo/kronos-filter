# Kronos Probability Analyzer

機率性股票分析工具，基於 [Kronos](https://github.com/shiyu-coder/Kronos) 基礎模型。給定一組 ticker，從 Yahoo Finance 抓歷史 OHLCV，跑 Kronos 多路徑採樣推論，對每檔股票產出：

- 上漲/下跌機率
- 預期漲幅/跌幅
- 報酬分佈百分位
- 最壞情境（路徑內最大回撤）
- 模型信心度

所有數字都來自 **N 條採樣預測路徑的統計分析**。例如 30 條路徑中 22 條收盤高於起始 → `prob_up = 73%`。簡單且可解讀。

> ⚠️ **Not financial advice.** 這些是**模型主觀機率**，不是真實世界機率。Kronos 是隨機模型，每次結果會略有不同。請用作研究助手，不要當神諭。

---

## Install

需要 Python 3.10+。

```bash
# 1. Clone 此專案（含 vendor/Kronos/ submodule）
git clone <your-repo>
cd kronos-analyzer

# 若 vendor/Kronos/ 是空的，手動 clone:
cd vendor
git clone --depth 1 https://github.com/shiyu-coder/Kronos.git
cd ..

# 2. 建立虛擬環境
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. 安裝套件
pip install -r requirements.txt
```

**GPU vs CPU**：有 NVIDIA GPU（CUDA）或 Apple Silicon（MPS）會自動使用；否則 fallback 到 CPU。Kronos-small 在 CPU 上可跑，但首次載入模型需下載約 100MB 權重。

---

## CLI Usage

```bash
python main.py --tickers AAPL,MSFT,NVDA --lookback 400 --pred_len 30 --samples 30
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--tickers` | (required) | Comma-separated tickers |
| `--lookback` | `400` | 歷史 bars（feed 給模型的長度）。Max 512 for Kronos-small/base |
| `--pred_len` | `30` | 預測多少 bars |
| `--samples` | `30` | 採樣路徑數（越多越準，但越慢） |
| `--interval` | `1d` | yfinance interval (`1d`, `1h`, `30m`…) |
| `--model_size` | `small` | `mini` / `small` / `base` |
| `--T` | `1.0` | 採樣溫度（高=隨機） |
| `--top_p` | `0.9` | Nucleus sampling |
| `--seed` | `None` | 隨機種子（reproducibility） |
| `--no-charts` | | 跳過 fan chart 生成 |

### Output

- Console 印出機率表格
- `./output/{ticker}_fan.png` — 每檔的 fan chart
- `./output/analysis_{timestamp}.csv` — 完整 metrics CSV
- `./results/{timestamp}-probability-report.json` — 結構化報告（供 Next.js 前端讀取）
- `./results/latest.json` — 最新一份報告的複本（前端 dashboard 預設讀這個）

### Example output

```
| ticker | signal         | prob_up | prob_up_5% | E[ret] | E[up]  | E[down] | p5      | p50    | p95     | max_dd | conf |
|--------|----------------|---------|------------|--------|--------|---------|---------|--------|---------|--------|------|
| NVDA   | Strong Bullish | 83%     | 67%        | +7.2%  | +9.8%  | -5.4%   | -3.1%   | +6.8%  | +18.4%  | 4.2%   | 中   |
| AAPL   | Bullish        | 70%     | 37%        | +3.5%  | +5.8%  | -2.1%   | -4.8%   | +3.0%  | +11.7%  | 3.6%   | 中   |
...
```

---

## Streamlit UI (本機互動)

```bash
streamlit run app.py
```

預設 `http://localhost:8501`。

- 左側欄位：所有參數可調
- 主畫面：排行榜表格 + 下載 CSV
- 下方：點選任一 ticker 看 fan chart

---

## Metric Glossary

| Metric | Meaning |
|---|---|
| `prob_up` | 收盤高於起始的路徑比例 |
| `prob_down` | 收盤低於起始的路徑比例 |
| `prob_up_5pct` | 收盤高於起始 +5% 的比例 |
| `prob_down_5pct` | 收盤低於起始 -5% 的比例 |
| `expected_return_up` | 上漲路徑的平均漲幅 |
| `expected_return_down` | 下跌路徑的平均跌幅 |
| `expected_return_overall` | 所有路徑的平均報酬 |
| `p5` | 第 5 百分位（worst case, 5% tail） |
| `p25` ~ `p75` | 「最可能範圍」 |
| `p95` | 第 95 百分位（best case, 5% tail） |
| `expected_max_drawdown` | 每條路徑的最大峰谷回撤，取平均 |
| `confidence_std` | `final_return` 在路徑間的標準差 |
| `confidence_label` | 高 (<0.03) / 中 (0.03-0.07) / 低 (≥0.07) |
| `signal_category` | Strong Bullish / Bullish / Neutral / Bearish / Strong Bearish |

### Signal category 閾值

- **Strong Bullish**: `prob_up ≥ 75%` 且 `p5 > 0`
- **Bullish**: `prob_up ≥ 60%`
- **Neutral**: `40% ≤ prob_up < 60%`
- **Bearish**: `prob_up < 40%`
- **Strong Bearish**: `prob_up < 25%` 且 `p95 < 0`

閾值可在 `probability_analyzer.py` 頂部調整。

---

## Architecture

```
main.py (CLI)           app.py (Streamlit)
    ↓                         ↓
    └──────→ fetcher.py ←─────┘
    └──────→ predictor.py ←───┘  ← uses vendored Kronos, retains all paths
    └──────→ probability_analyzer.py ←─┘
    └──────→ visualizer.py ←──┘

output: ./output/*.png + *.csv
output: ./results/*.json (for Next.js frontend)
```

### Key design: we need ALL sampled paths

Kronos 原版 `predict()` 會把 `sample_count` 條路徑平均成 1 條後回傳（見 vendor/Kronos/model/kronos.py 最後兩行）。本專案把那段程式碼複製到 `predictor.py` 並**移除平均步驟**，保留 shape `[sample_count, pred_len, 6]` 給 `probability_analyzer.py` 做統計分析。

---

## Limitations

- **Kronos 是隨機模型**：相同 input + 不同 seed 會有不同結果
- **機率是模型主觀**：不保證反映真實世界機率分布
- **Lookback 太短可能影響準確度**：建議 ≥ 200 bars
- **Yahoo 沒有 `amount` 欄位**：由 Kronos 內部自動填補為 `volume × mean(OHLC)`
- **Not financial advice**：本工具不輸出買賣建議，由使用者自行判斷

---

## Next.js Frontend

公開展示部分會由 `frontend/`（Next.js）獨立提供，讀取 `results/` 的 JSON 檔案。詳見 `frontend/README.md`（待建立）。

---

## Roadmap

- [x] MVP (CLI + Streamlit + JSON output)
- [ ] Next.js 前端（deploy 到 Vercel）
- [ ] 與 project-secretary 的 insights-hub 整合（export_to_hub.py）
- [ ] 每日自動化（cron / GitHub Actions）
- [ ] 歷史預測 vs 實際回測追蹤
