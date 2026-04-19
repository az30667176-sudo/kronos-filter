/**
 * Thin client for calling the Kronos Filter HuggingFace Space's Gradio API.
 *
 * Gradio exposes a two-step HTTP pattern:
 *   1. POST /call/{api_name} with { data: [...inputs] } → returns { event_id }
 *   2. GET  /call/{api_name}/{event_id}                 → streams SSE events
 */

export const SPACE_BASE_URL = "https://kurtobe-kronos-filter.hf.space";

export interface SpaceRequest {
  tickers: string[];
  lookback: number;
  pred_len: number;
  samples: number;
  seed: number | null;
}

export interface SpaceResponse {
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
  tickers: Array<Record<string, unknown>>;
  path_summaries: Array<Record<string, unknown>>;
}

/**
 * Submit a prediction request to the Space. Returns the final JSON report.
 * Stage can be consumed via optional progress callback.
 */
export async function callPredict(
  req: SpaceRequest,
  onProgress?: (stage: string) => void,
): Promise<SpaceResponse> {
  onProgress?.("Submitting request...");
  const submitRes = await fetch(`${SPACE_BASE_URL}/call/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        req.tickers.join(","),
        req.lookback,
        req.pred_len,
        req.samples,
        req.seed === null ? "" : String(req.seed),
      ],
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Submit failed: ${submitRes.status} ${text}`);
  }
  const submitJson = (await submitRes.json()) as { event_id: string };
  const eventId = submitJson.event_id;
  if (!eventId) throw new Error("Missing event_id in submit response");

  onProgress?.("Queued, waiting for worker...");

  // Stream SSE events
  const streamRes = await fetch(`${SPACE_BASE_URL}/call/predict/${eventId}`);
  if (!streamRes.ok || !streamRes.body) {
    throw new Error(`Stream failed: ${streamRes.status}`);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let lastStage = "Queued, waiting for worker...";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Process complete SSE events (separated by \n\n)
    let eventEnd: number;
    while ((eventEnd = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, eventEnd);
      buf = buf.slice(eventEnd + 2);

      const lines = block.split("\n");
      let eventType = "message";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
      }

      if (eventType === "complete" && dataStr) {
        try {
          const arr = JSON.parse(dataStr);
          if (Array.isArray(arr) && arr.length > 0) {
            return arr[0] as SpaceResponse;
          }
        } catch (e) {
          throw new Error(`Parse complete event failed: ${e}`);
        }
      } else if (eventType === "error") {
        throw new Error(`Space error: ${dataStr}`);
      } else if (eventType === "heartbeat") {
        // ignore
      } else if (eventType === "generating") {
        const newStage = "Running Kronos inference...";
        if (newStage !== lastStage) {
          lastStage = newStage;
          onProgress?.(newStage);
        }
      }
    }
  }

  throw new Error("Stream ended without complete event");
}
