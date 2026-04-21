export default function AboutPage() {
  return (
    <article className="max-w-[760px] mx-auto">
      <header className="mb-10">
        <div
          className="inline-block px-3 py-1 rounded-full text-xs mb-4 mono"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            border: "1px solid var(--accent-dim)",
          }}
        >
          Documentation
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          How <span className="gradient-text">Kronos</span> predicts the future
        </h1>
        <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
          Every number on this site comes from a foundation model. Here&apos;s what that actually means.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">TL;DR</h2>
        <div
          className="p-5 rounded-xl leading-relaxed"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <p className="mb-3">
            Kronos is the <b style={{ color: "var(--accent)" }}>GPT of stock markets</b> — an
            open-source foundation model trained on K-line data from 45+ global exchanges.
          </p>
          <p className="mb-3">
            For each ticker, we sample{" "}
            <b style={{ color: "var(--text-primary)" }}>30 possible future paths</b> from Kronos and
            compute probabilities from them.
          </p>
          <p>
            When you see <b>prob_up 73%</b>, it means 22 out of 30 sampled paths ended higher than the
            starting price. These are the <b>model&apos;s subjective probabilities</b>, not
            real-world probabilities.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">What is Kronos?</h2>
        <ul className="space-y-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <li className="flex gap-3">
            <span style={{ color: "var(--accent)" }}>◆</span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>Architecture:</b> Decoder-only Transformer
              (same family as ChatGPT)
            </span>
          </li>
          <li className="flex gap-3">
            <span style={{ color: "var(--accent)" }}>◆</span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>Training data:</b> K-line sequences from 45+
              global exchanges
            </span>
          </li>
          <li className="flex gap-3">
            <span style={{ color: "var(--accent)" }}>◆</span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>Model size:</b> Kronos-small has 24.7M
              parameters (GPT-2 scale)
            </span>
          </li>
          <li className="flex gap-3">
            <span style={{ color: "var(--accent)" }}>◆</span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>Origin:</b> Tsinghua University team,
              paper published 2025-08
            </span>
          </li>
          <li className="flex gap-3">
            <span style={{ color: "var(--accent)" }}>◆</span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>License:</b> Open source (MIT) —{" "}
              <a
                href="https://github.com/shiyu-coder/Kronos"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
                className="underline"
              >
                github.com/shiyu-coder/Kronos
              </a>
            </span>
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Two-stage architecture (the clever bit)</h2>
        <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
          GPT processes text tokens. But stock prices are continuous numbers. Kronos bridges this gap
          with a two-stage framework:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-xs mb-2 mono uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Stage 1
            </div>
            <h3 className="font-semibold mb-2">Tokenizer</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Quantizes each K-bar (OHLCV) into a few discrete tokens using hierarchical binary
              spherical quantization.
            </p>
          </div>
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-xs mb-2 mono uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Stage 2
            </div>
            <h3 className="font-semibold mb-2">Transformer</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Autoregressively predicts the next token given the previous ones — exactly like GPT
              predicting the next word.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">How prediction works</h2>
        <div
          className="rounded-xl p-5 mono text-sm leading-relaxed"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <div><span style={{ color: "var(--text-muted)" }}>Input:</span>  past 400 K-bars (OHLCV)</div>
          <div className="my-1" style={{ color: "var(--accent)" }}>  ↓</div>
          <div>Tokenizer → [t<sub>1</sub>, t<sub>2</sub>, ..., t<sub>400</sub>]</div>
          <div className="my-1" style={{ color: "var(--accent)" }}>  ↓</div>
          <div>Transformer predicts <b style={{ color: "var(--text-primary)" }}>probability distribution</b> over next token</div>
          <div className="my-1" style={{ color: "var(--accent)" }}>  ↓</div>
          <div><span style={{ color: "var(--accent-alt)" }}>Sample</span> one token from the distribution</div>
          <div className="my-1" style={{ color: "var(--accent)" }}>  ↓</div>
          <div>Append to sequence, repeat 30 times</div>
          <div className="my-1" style={{ color: "var(--accent)" }}>  ↓</div>
          <div>Decode tokens → future OHLCV prices (one path)</div>
          <div className="my-2" style={{ color: "var(--text-muted)" }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div><span style={{ color: "var(--accent-alt)" }}>Repeat 30 times</span> with different sampling seeds</div>
          <div>→ <b style={{ color: "var(--text-primary)" }}>30 alternative futures</b></div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Why 30 different paths?</h2>
        <p className="mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          At each step, Kronos doesn&apos;t output a single number. It outputs a{" "}
          <b style={{ color: "var(--text-primary)" }}>probability distribution</b>:
        </p>
        <div
          className="rounded-xl p-4 mono text-sm mb-3"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
        >
          <div style={{ color: "var(--text-muted)" }}>Next K-bar token could be:</div>
          <div style={{ color: "var(--green)" }}>  token_A (35%)  ← small drop</div>
          <div style={{ color: "var(--green)" }}>  token_B (30%)  ← small gain</div>
          <div style={{ color: "var(--green)" }}>  token_C (20%)  ← flat</div>
          <div style={{ color: "var(--green)" }}>  token_D (10%)  ← large drop</div>
          <div style={{ color: "var(--text-muted)" }}>  ...</div>
        </div>
        <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Each sample uses a different random seed → picks a different token → produces a different
          path. Run it 30 times and you get 30 alternative futures, from which we compute:
          <br /><br />
          <b className="mono" style={{ color: "var(--accent)" }}>prob_up = (paths ending higher) / 30</b>
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Sampling controls</h2>
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-card)" }}>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Parameter</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Meaning</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Default</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <td className="px-4 py-3 mono" style={{ color: "var(--accent)" }}>T</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Temperature. T=0 always picks the most likely token (deterministic). T=1 samples according to the true distribution. T&gt;1 is more random.
                </td>
                <td className="px-4 py-3 mono">1.0</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <td className="px-4 py-3 mono" style={{ color: "var(--accent)" }}>top_p</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  Nucleus sampling. Only sample from the top X% most likely tokens — prevents weird edge-case outputs.
                </td>
                <td className="px-4 py-3 mono">0.9</td>
              </tr>
              <tr style={{ background: "var(--bg-card)" }}>
                <td className="px-4 py-3 mono" style={{ color: "var(--accent)" }}>samples</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  How many independent paths to generate. More = more stable probabilities, but slower.
                </td>
                <td className="px-4 py-3 mono">30</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">What makes Kronos special</h2>
        <div className="space-y-4">
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <h3 className="font-semibold mb-2" style={{ color: "var(--accent)" }}>
              Not a time-series model, a language model
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              LSTM / ARIMA give you a single predicted number. Kronos{" "}
              <b style={{ color: "var(--text-primary)" }}>generates complete paths</b>, letting us
              compute any distribution-level metric.
            </p>
          </div>
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <h3 className="font-semibold mb-2" style={{ color: "var(--accent)" }}>
              Zero-shot on unseen tickers
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Trained on 45+ exchanges, it has learned the &quot;grammar&quot; of K-lines — head-and-shoulders,
              double bottoms, volume divergence — so it works on any ticker without retraining.
            </p>
          </div>
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <h3 className="font-semibold mb-2" style={{ color: "var(--accent)" }}>
              Natively probabilistic
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Other models give &quot;80% up&quot; and you have to trust that number. Kronos gives you
              30 possible futures and you compute probabilities yourself — fully transparent.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Important caveats</h2>
        <div
          className="p-5 rounded-xl border-l-4"
          style={{
            background: "var(--bg-card)",
            borderLeftColor: "var(--red)",
            border: "1px solid var(--border)",
            borderLeftWidth: 4,
          }}
        >
          <p className="mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <b style={{ color: "var(--text-primary)" }}>The 30 paths are NOT real futures.</b> They
            are what the model <i>imagines</i>, based only on patterns it saw in history.
          </p>
          <ul className="space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>• It doesn&apos;t know earnings, news, Fed decisions, geopolitics</li>
            <li>• It&apos;s blind to black swans</li>
            <li>• It works better in stable regimes, worse during regime change</li>
            <li>• Re-running without a seed produces different numbers</li>
            <li>
              • <b style={{ color: "var(--red)" }}>This is not financial advice.</b> It&apos;s a
              research tool, not an oracle.
            </li>
          </ul>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Cloud vs. Local: two ways to run</h2>
        <p className="mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Kronos Filter has two execution paths. Both save to the same Supabase database, so your
          history and backtest accuracy accumulate regardless of which you use.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-xs mb-2 mono uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Web (HF Spaces)
            </div>
            <h3 className="font-semibold mb-2">Quick check from anywhere</h3>
            <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>◆ Zero setup — just click Predict</li>
              <li>◆ Shared HF free CPU</li>
              <li>◆ Best for 1–3 tickers × ≤15 samples</li>
              <li>◆ Heavy requests (&gt;5 min) will time out</li>
              <li>◆ Cold start ~30s after idle</li>
            </ul>
          </div>
          <div
            className="p-5 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-xs mb-2 mono uppercase tracking-wider"
              style={{ color: "var(--accent-alt)" }}
            >
              Local CLI
            </div>
            <h3 className="font-semibold mb-2">Heavy analysis on your machine</h3>
            <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>◆ Runs on your CPU (or GPU if configured)</li>
              <li>◆ No limits on size — scan 50+ tickers</li>
              <li>◆ Model loaded in RAM between runs</li>
              <li>◆ Same code, same model, same results</li>
              <li>
                ◆ Run:{" "}
                <code className="mono text-xs" style={{ color: "var(--accent)" }}>
                  python main.py --tickers ...
                </code>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Need faster cloud? Subscribe to{" "}
          <a
            href="https://huggingface.co/subscribe/pro"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
            className="underline"
          >
            HF Pro
          </a>{" "}
          ($9/month) — unlocks ZeroGPU A10G (~10x faster). The code is already instrumented for it;
          just toggle the hardware setting.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Why combine with other sources?</h2>
        <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Kronos is one perspective. Combined with <b>fundamental analysis</b> (what the business
          does) and <b>technical momentum</b> (how the price is actually moving right now), you get
          a richer picture. That&apos;s why Kronos Filter feeds signals into a separate{" "}
          <span className="mono" style={{ color: "var(--accent)" }}>insights-hub</span> system that
          cross-references all three.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">References</h2>
        <ul className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <li>
            ◆ Paper:{" "}
            <a
              href="https://arxiv.org/abs/2508.02739"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
              className="underline"
            >
              arXiv:2508.02739
            </a>
          </li>
          <li>
            ◆ Code:{" "}
            <a
              href="https://github.com/shiyu-coder/Kronos"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
              className="underline"
            >
              github.com/shiyu-coder/Kronos
            </a>
          </li>
          <li>
            ◆ Live demo (BTC 24h):{" "}
            <a
              href="https://shiyu-coder.github.io/Kronos-demo/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
              className="underline"
            >
              shiyu-coder.github.io/Kronos-demo
            </a>
          </li>
          <li>
            ◆ Models:{" "}
            <a
              href="https://huggingface.co/NeoQuasar"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
              className="underline"
            >
              huggingface.co/NeoQuasar
            </a>
          </li>
        </ul>
      </section>
    </article>
  );
}
