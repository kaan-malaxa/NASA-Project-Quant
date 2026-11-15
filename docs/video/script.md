# FireRosetta video script

**Integration draft: six shots, thirty seconds.** The local US source folder contains raw country CSVs, but the numbers audit, US trend export, US nowcast export and web assets are absent. The requested evidence-dependent lines remain explicit placeholders. Do not record those placeholders as narration or present the requested calibration and planted-truth claim as established before its supporting outputs are reviewed.

## Shot plan

The voice-over column is the complete narration, in order. Subtitle text matches it; the date, credits, URLs and team label are additional on-screen text.

| Shot | Time | On-screen action | Voice-over | Subtitle text |
|---|---|---|---|---|
| 1 | 00:00:00,000 --> 00:00:02,000 | Show team name `{{team:name}}`, project name FireRosetta, and the broken-ruler view. | FireRosetta. | FireRosetta. |
| 2 | 00:00:02,000 --> 00:00:05,000 | Animate the naive index jump. Show `{{audit:us_jump_multiple}} times` from the audit. Keep the chart's normalized-index labels visible. | {{audit:us_jump_multiple}} times. | {{audit:us_jump_multiple}} times. |
| 3 | 00:00:05,000 --> 00:00:12,000 | Show the drift chart and configured stable calibration period, then reveal the harmonized line. Show isolated planted-truth validation clearly labeled as synthetic if visible. | we calibrate only where the old satellite was steady, and prove it on a simulated world | we calibrate only where the old satellite was steady, and prove it on a simulated world |
| 4 | 00:00:12,000 --> 00:00:22,000 | Select United States. Hold the exact exported verdict `{{audit:us_verdict_sentence}}` with its ranges, then reveal the calendar. Retain value-kind labels, units and missing-day markings. | {{audit:us_verdict_sentence}} | {{audit:us_verdict_sentence}} |
| 5 | 00:00:22,000 --> 00:00:27,000 | Open This week. Show `{{audit:us_nowcast_sentence}}` verbatim and the separate overlay `As of {{audit:us_nowcast_as_of}}`, copied exactly from the exported timestamp. Use only the actual integrated state; an unavailable result must remain unavailable. | {{audit:us_nowcast_sentence}} | {{audit:us_nowcast_sentence}} |
| 6 | 00:00:27,000 --> 00:00:30,000 | Hold `Data: NASA FIRMS`, `https://firms.modaps.eosdis.nasa.gov/`, and live-site URL `{{link:live_site}}`. Show a QR code targeting that confirmed live URL. Use text credits without a NASA logo or insignia. | Data: NASA FIRMS. | Data: NASA FIRMS. |

## Integration inputs

| Placeholder | Required source |
|---|---|
| `{{audit:us_jump_multiple}}` | Exact audited value for `web/public/data/us/ruler.json` → `jump_multiple.value`. |
| `{{audit:us_verdict_sentence}}` | Complete `web/public/data/us/trend.json` → `sentence`, verbatim, with every numerical claim checked against the audit. |
| `{{audit:us_nowcast_sentence}}` | Complete `web/public/data/us/nowcast.json` → `sentence`, verbatim, with every numerical claim checked against the audit. |
| `{{audit:us_nowcast_as_of}}` | Exact `web/public/data/us/nowcast.json` → `as_of`, checked against the audit and displayed on screen. |
| `{{team:name}}` | Confirmed team name; the repository currently leaves this pending. |
| `{{link:live_site}}` | Confirmed public deployment URL, also used as the QR destination. |

The audit labels above are requested entries, not a claim that those entries already exist. Raw CSVs cannot supply a harmonized verdict or current-week status. Do not substitute contract examples, recompute a pitch value from raw files, invent a timestamp, or relabel historical data as recent. If the required exports are still absent at recording time, this remains a draft.

## Spoken-word budget and timing

The fixed narration contains **21 spoken words**, excluding unresolved insertions. The jump value, verdict sentence and nowcast sentence together have a remaining budget of **54 spoken words**, for a maximum of **75**. Count numbers as actually pronounced. Team name, the on-screen timestamp, URLs and other silent labels are outside the narration count.

Final word count is **pending integration**. Recount after inserting the exact exported text in both this table and `subtitles.srt`; a placeholder must never be counted as a completed sentence. Rehearse the inserted sentences in their allocated slots. If they exceed the word budget or cannot be read clearly, keep the draft unapproved and resolve the timing with the team; preserve the requested verbatim sentences.

The subtitle cues are contiguous from the start through thirty seconds. After integration, reflow long sentences into readable caption lines without changing their words. The timestamp is a separate video overlay, so it is not spoken or added to the narration subtitles.

## Burn subtitles into the recording

Run from the repository root, with the finished recording saved there as `video.mp4` and the integrated subtitle file at `docs/video/subtitles.srt`:

```text
ffmpeg -i video.mp4 -vf "subtitles=filename=docs/video/subtitles.srt:charenc=UTF-8" -t 30 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy -movflags +faststart video_subtitled.mp4
```

This single-line command uses relative forward-slash paths and double quotes for Windows PowerShell, macOS and Linux shells. It writes `video_subtitled.mp4` beside the input. Use an FFmpeg build with the `subtitles` filter (libass) and the `libx264` encoder. The duration cap trims a longer input; a shorter recording still needs to be edited to the planned duration. Add the QR code and on-screen timestamp during editing; the subtitle filter only burns the SRT text.

References: [FFmpeg subtitles filter and UTF-8 character-encoding option](https://ffmpeg.org/ffmpeg-filters.html#subtitles-1), [FFmpeg command-line options](https://ffmpeg.org/ffmpeg.html). FFmpeg and an input recording are absent from this session, so no burn-in or rendered-duration check has been performed.

For any map footage, retain [OpenFreeMap](https://openfreemap.org/), [© OpenMapTiles](https://www.openmaptiles.org/) and [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) attribution. Data credit: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/).
