export interface TickerMetrics {
  ticker: string;
  initial_close: number;
  prob_up: number;
  prob_down: number;
  prob_up_5pct: number;
  prob_down_5pct: number;
  expected_return_up: number;
  expected_return_down: number;
  expected_return_overall: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  expected_max_drawdown: number;
  confidence_std: number;
  confidence_label: string;
  signal_category: string;
  n_paths: number;
}

export interface PathSummary {
  ticker: string;
  history_dates: string[];
  history_close: number[];
  future_dates: string[];
  median_path: number[];
  p5_path: number[];
  p25_path: number[];
  p75_path: number[];
  p95_path: number[];
}

export interface ProbabilityReport {
  generated_at: string;
  config: {
    lookback: number;
    pred_len: number;
    samples: number;
    model_size: string;
    interval: string;
    T: number;
    top_p: number;
    seed: number | null;
  };
  failed_tickers: string[];
  data_last_date: string | null;
  tickers: TickerMetrics[];
  path_summaries: PathSummary[];
}
