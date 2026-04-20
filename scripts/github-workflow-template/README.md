# GitHub Actions workflow template

This folder contains workflow YAML that couldn't be pushed directly (the PAT used
during setup didn't have `workflow` scope). To enable the daily scoring cron:

1. In the GitHub web UI, go to the repo → **Actions** → **New workflow** → **Set up a workflow yourself**
2. Name the file `score-predictions.yml`
3. Paste the contents of `score-predictions.yml` (next to this README) into the editor
4. Commit directly to `main`

The daily scoring job will then run at 23:00 UTC every day, fetching actual OHLCV from Yahoo for
every `kronos_predictions` row whose `pred_end_date` has passed but `scored_at` is still NULL.

### Required secrets (already set via API)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

You can verify them under repo → **Settings** → **Secrets and variables** → **Actions**.
