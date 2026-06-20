# Backlog

## LaunchBox provider decision

Date: 2026-06-20

Context: LaunchBox looks like a valuable game metadata source, but the provider
currently depends on a large `Metadata.zip` dataset. It must not download,
extract, or build that index during a normal scan or metadata request.

Decision to revisit after the current reliability/performance cleanup:

- Keep LaunchBox only if we can make it genuinely fast and useful.
- Optimize it around a local/prebuilt index, not request-time work.
- Measure lookup latency, memory usage, disk footprint, and metadata value
  compared with ScreenScraper, IGDB, TheGamesDB, RAWG, and CoverProject.
- Consider a compact generated index keyed by normalized title/platform,
  optional admin/background index build, and clear UI/status for whether the
  provider is ready.
- If it cannot be made fast and reliable enough, remove the provider fully
  instead of keeping unused code around.

Current guardrail: implicit request-time download/build is disabled. A cached
index can still be used, and explicit configuration can still build one.
