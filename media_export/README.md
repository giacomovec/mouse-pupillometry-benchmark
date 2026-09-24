# Website visual media export

`website_visual_media_manifest.json` and `../public/media/real-validation/` hold
the bounded image evidence used by the static benchmark site. Regenerate from the
MouseFormer workspace with:

```bash
python3 benchmark_site/media_export/export_visual_media.py
```

The exporter reads the frozen real-validation visual atlas and validation
manifest. It copies only selected, hash-verified source/GT pairs from the
canonical scored ROI. Every PNG retains its own frozen ROI dimensions and exact
scored coordinates; there is no resizing, model execution, or metric calculation.

The representative set uses the frozen 21 prediction-blind sample IDs. Each
case includes up to five ordered validation frames from the same candidate
sequence, selected around the frozen anchor using source frame numbers alone.
All original frame IDs and skipped-frame gaps are retained. The source bundle
does not record acquisition frame rate or timestamps, so `timestampMs` is null
and the viewer labels the source frame number with “time unavailable.”

The separate worst-case set selects the maximum finite equivalent-diameter ARE
among valid, primary-retained rows for each method and result plane in
`REAL_VALIDATION_SUMMARY.csv`, using the linked canonical `FRAME_METRICS.csv`.
Cases are labeled outcome-selected and not representative. Where two planes for
the same method select the same source frame, they share one case ID with both
selection triggers recorded.

The current export contains 21 representative cases (105 frames) and 10 unique
outcome-selected cases (18 method/plane triggers, 9 unique anchor frames). The
static export includes 138 unique source PNGs and 136 unique GT PNGs (about
4.7 MB). ROI dimensions can vary by sample and are recorded per frame. No Allen,
protected, full-population, or raw-video assets are copied.

Public media paths are content-addressed under `/media/real-validation/`.
`website_visual_media_manifest.json` records the source freeze and validation
hashes, original source IDs and hashes, scored ROI and GT hashes, case/frame IDs,
timestamp availability, and exact ROI transforms.
