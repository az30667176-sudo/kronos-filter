"""
predictor.py — Kronos inference wrapper that RETAINS all sampled paths.

Kronos's built-in `predict()` averages across sample_count paths.
We need individual paths for probability analysis, so we override the final
averaging step. See `predict_batch_paths()`.
"""
from __future__ import annotations

import os
import sys
import logging
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import torch

# Make vendored Kronos importable
VENDOR_ROOT = Path(__file__).resolve().parent / "vendor" / "Kronos"
if str(VENDOR_ROOT) not in sys.path:
    sys.path.insert(0, str(VENDOR_ROOT))

from model import Kronos, KronosTokenizer, KronosPredictor  # noqa: E402
from model.kronos import sample_from_logits, calc_time_stamps  # noqa: E402

logger = logging.getLogger(__name__)

MODEL_IDS = {
    "mini": ("NeoQuasar/Kronos-Tokenizer-2k", "NeoQuasar/Kronos-mini", 2048),
    "small": ("NeoQuasar/Kronos-Tokenizer-base", "NeoQuasar/Kronos-small", 512),
    "base": ("NeoQuasar/Kronos-Tokenizer-base", "NeoQuasar/Kronos-base", 512),
}


def _auto_regressive_inference_keep_paths(
    tokenizer,
    model,
    x,
    x_stamp,
    y_stamp,
    max_context: int,
    pred_len: int,
    clip: float = 5.0,
    T: float = 1.0,
    top_k: int = 0,
    top_p: float = 0.9,
    sample_count: int = 5,
    verbose: bool = False,
):
    """
    Copied from vendor/Kronos/model/kronos.py auto_regressive_inference,
    with the final averaging REMOVED to retain all sampled paths.

    Returns a numpy array of shape [batch, sample_count, total_seq_len, 6]
    instead of [batch, total_seq_len, 6].
    """
    try:
        from tqdm import trange
    except ImportError:
        trange = range

    with torch.no_grad():
        x = torch.clip(x, -clip, clip)
        device = x.device

        x = x.unsqueeze(1).repeat(1, sample_count, 1, 1).reshape(-1, x.size(1), x.size(2)).to(device)
        x_stamp = x_stamp.unsqueeze(1).repeat(1, sample_count, 1, 1).reshape(-1, x_stamp.size(1), x_stamp.size(2)).to(device)
        y_stamp = y_stamp.unsqueeze(1).repeat(1, sample_count, 1, 1).reshape(-1, y_stamp.size(1), y_stamp.size(2)).to(device)

        x_token = tokenizer.encode(x, half=True)

        initial_seq_len = x.size(1)
        batch_size = x_token[0].size(0)
        total_seq_len = initial_seq_len + pred_len
        full_stamp = torch.cat([x_stamp, y_stamp], dim=1)

        generated_pre = x_token[0].new_empty(batch_size, pred_len)
        generated_post = x_token[1].new_empty(batch_size, pred_len)

        pre_buffer = x_token[0].new_zeros(batch_size, max_context)
        post_buffer = x_token[1].new_zeros(batch_size, max_context)
        buffer_len = min(initial_seq_len, max_context)
        if buffer_len > 0:
            start_idx = max(0, initial_seq_len - max_context)
            pre_buffer[:, :buffer_len] = x_token[0][:, start_idx:start_idx + buffer_len]
            post_buffer[:, :buffer_len] = x_token[1][:, start_idx:start_idx + buffer_len]

        ran = trange if verbose else range
        for i in ran(pred_len):
            current_seq_len = initial_seq_len + i
            window_len = min(current_seq_len, max_context)

            if current_seq_len <= max_context:
                input_tokens = [
                    pre_buffer[:, :window_len],
                    post_buffer[:, :window_len],
                ]
            else:
                input_tokens = [pre_buffer, post_buffer]

            context_end = current_seq_len
            context_start = max(0, context_end - max_context)
            current_stamp = full_stamp[:, context_start:context_end, :].contiguous()

            s1_logits, context = model.decode_s1(input_tokens[0], input_tokens[1], current_stamp)
            s1_logits = s1_logits[:, -1, :]
            sample_pre = sample_from_logits(s1_logits, temperature=T, top_k=top_k, top_p=top_p, sample_logits=True)

            s2_logits = model.decode_s2(context, sample_pre)
            s2_logits = s2_logits[:, -1, :]
            sample_post = sample_from_logits(s2_logits, temperature=T, top_k=top_k, top_p=top_p, sample_logits=True)

            generated_pre[:, i] = sample_pre.squeeze(-1)
            generated_post[:, i] = sample_post.squeeze(-1)

            if current_seq_len < max_context:
                pre_buffer[:, current_seq_len] = sample_pre.squeeze(-1)
                post_buffer[:, current_seq_len] = sample_post.squeeze(-1)
            else:
                pre_buffer.copy_(torch.roll(pre_buffer, shifts=-1, dims=1))
                post_buffer.copy_(torch.roll(post_buffer, shifts=-1, dims=1))
                pre_buffer[:, -1] = sample_pre.squeeze(-1)
                post_buffer[:, -1] = sample_post.squeeze(-1)

        full_pre = torch.cat([x_token[0], generated_pre], dim=1)
        full_post = torch.cat([x_token[1], generated_post], dim=1)

        context_start = max(0, total_seq_len - max_context)
        input_tokens = [
            full_pre[:, context_start:total_seq_len].contiguous(),
            full_post[:, context_start:total_seq_len].contiguous(),
        ]
        z = tokenizer.decode(input_tokens, half=True)
        z = z.reshape(-1, sample_count, z.size(1), z.size(2))
        # KEY CHANGE: do NOT average; return all paths
        preds = z.cpu().numpy()  # shape: [batch, sample_count, seq_len, 6]
        return preds


class KronosPathsPredictor:
    """Wraps KronosPredictor but returns all sampled paths per ticker."""

    def __init__(self, model_size: str = "small", device: str | None = None):
        if model_size not in MODEL_IDS:
            raise ValueError(f"model_size must be one of {list(MODEL_IDS.keys())}")
        tokenizer_id, model_id, max_context = MODEL_IDS[model_size]
        self.max_context = max_context
        self.model_size = model_size
        self.model_id = model_id

        if device is None:
            if torch.cuda.is_available():
                device = "cuda:0"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"
        self.device = device

        logger.info(f"Loading tokenizer: {tokenizer_id}")
        self.tokenizer = KronosTokenizer.from_pretrained(tokenizer_id)
        logger.info(f"Loading model: {model_id}")
        self.model = Kronos.from_pretrained(model_id)
        self.tokenizer = self.tokenizer.to(self.device)
        self.model = self.model.to(self.device)

        self.price_cols = ["open", "high", "low", "close"]
        self.vol_col = "volume"
        self.amt_col = "amount"
        self.clip = 5.0

    def _prepare_one(self, df: pd.DataFrame, x_timestamp: pd.Series, y_timestamp: pd.Series):
        df = df.copy()
        # Fill amount if missing (Kronos's own logic)
        if self.vol_col not in df.columns:
            df[self.vol_col] = 0.0
            df[self.amt_col] = 0.0
        if self.amt_col not in df.columns:
            df[self.amt_col] = df[self.vol_col] * df[self.price_cols].mean(axis=1)

        if df[self.price_cols + [self.vol_col, self.amt_col]].isnull().values.any():
            raise ValueError("DataFrame contains NaN in price/volume columns")

        x_time = calc_time_stamps(x_timestamp)
        y_time = calc_time_stamps(y_timestamp)

        x = df[self.price_cols + [self.vol_col, self.amt_col]].values.astype(np.float32)
        x_stamp = x_time.values.astype(np.float32)
        y_stamp = y_time.values.astype(np.float32)

        x_mean = np.mean(x, axis=0)
        x_std = np.std(x, axis=0)
        x_norm = (x - x_mean) / (x_std + 1e-5)
        x_norm = np.clip(x_norm, -self.clip, self.clip)

        return x_norm, x_stamp, y_stamp, x_mean, x_std

    def predict_paths(
        self,
        df_list: list[pd.DataFrame],
        x_timestamp_list: list[pd.Series],
        y_timestamp_list: list[pd.Series],
        pred_len: int,
        T: float = 1.0,
        top_k: int = 0,
        top_p: float = 0.9,
        sample_count: int = 30,
        verbose: bool = False,
        seed: int | None = None,
    ) -> list[np.ndarray]:
        """
        Returns a list of per-ticker arrays, each of shape
        [sample_count, pred_len, 6] with columns
        [open, high, low, close, volume, amount] in ORIGINAL scale.
        """
        if seed is not None:
            torch.manual_seed(seed)
            np.random.seed(seed)

        if not (len(df_list) == len(x_timestamp_list) == len(y_timestamp_list)):
            raise ValueError("df_list / x_timestamp_list / y_timestamp_list must be same length")

        seq_lens = [len(df) for df in df_list]
        y_lens = [len(ts) for ts in y_timestamp_list]
        if len(set(seq_lens)) > 1:
            raise ValueError(f"All dfs must have same historical length, got {seq_lens}")
        if len(set(y_lens)) > 1:
            raise ValueError(f"All y_timestamps must have same length, got {y_lens}")

        x_batch = []
        x_stamp_batch = []
        y_stamp_batch = []
        means = []
        stds = []
        for df, x_ts, y_ts in zip(df_list, x_timestamp_list, y_timestamp_list):
            x_norm, x_stamp, y_stamp, m, s = self._prepare_one(df, x_ts, y_ts)
            x_batch.append(x_norm)
            x_stamp_batch.append(x_stamp)
            y_stamp_batch.append(y_stamp)
            means.append(m)
            stds.append(s)

        x_batch = np.stack(x_batch, axis=0)
        x_stamp_batch = np.stack(x_stamp_batch, axis=0)
        y_stamp_batch = np.stack(y_stamp_batch, axis=0)

        x_tensor = torch.from_numpy(x_batch.astype(np.float32)).to(self.device)
        x_stamp_tensor = torch.from_numpy(x_stamp_batch.astype(np.float32)).to(self.device)
        y_stamp_tensor = torch.from_numpy(y_stamp_batch.astype(np.float32)).to(self.device)

        # preds: [batch, sample_count, total_seq_len, 6]
        preds_all = _auto_regressive_inference_keep_paths(
            self.tokenizer, self.model,
            x_tensor, x_stamp_tensor, y_stamp_tensor,
            self.max_context, pred_len,
            self.clip, T, top_k, top_p, sample_count, verbose,
        )

        # Slice to pred_len and denormalize per ticker
        results: list[np.ndarray] = []
        for i, (m, s) in enumerate(zip(means, stds)):
            pred = preds_all[i]  # [sample_count, total_seq_len, 6]
            pred = pred[:, -pred_len:, :]  # [sample_count, pred_len, 6]
            pred = pred * (s + 1e-5) + m
            results.append(pred.astype(np.float32))
        return results
