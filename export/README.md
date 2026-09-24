# Benchmark data export

The static files in `public/data/` are generated from canonical MouseFormer CSV and JSON sources. This exporter does not run inference or calculate replacement scientific metrics. It preserves source values, method-specific operating points, unavailable evidence, and input hashes. A development version is derived from the hashes of every input used; a formal freeze is left unset until the parent project's freeze gate is complete.

## Rebuild in the parent workspace

Run from the MouseFormer workspace root:

```sh
python3 benchmark_site/export/build_benchmark_data.py
python3 benchmark_site/export/build_benchmark_data.py --verify
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s benchmark_site/export/tests -v
```

The full verifier checks the canonical input hashes as well as the exported JSON, every visual case ID, the 30 deployment conditions, required metric-card volume, and local media references and hashes. The unit tests also verify selected metric joins against their canonical rows and repeat the build to check byte-for-byte reproducibility.

For a private site checkout without the parent MouseFormer source tables, run the packaged-export verifier from the site directory:

```sh
cd benchmark_site
python3 export/build_benchmark_data.py --verify-export-only --output-dir public/data
```

This mode validates the manifest and JSON hashes, completeness and category counts, visual-case IDs, the 30 deployment conditions, capability rows, risk-curve endpoints, and local `/media/` paths and hashes using only the repository's `public/` directory. It cannot reconcile values against the parent canonical tables. A full rebuild or `--verify` requires the parent workspace.

## Source map

| Export | Canonical source families |
| --- | --- |
| `methods.json` | `METHOD_VISUAL_IDENTITY_V2.json`; variant aliases are display-only and retain the source method IDs. |
| `real_validation.json`, `geometry.json`, `segmentation.json`, `coverage_risk.json` | Corrected `real_validation_v7` payload, summary and evidence tables; per-method frozen `FRAME_METRICS.csv` and source-provided `RISK_COVERAGE.csv`; bounded source/GT media manifest. Risk curves are copied point-for-point, with the full-coverage “No confidence cutoff” endpoint retained. |
| `exact_gt.json` | Exact-GT V2.1 canonical summary and frame-metric tables, including the 252-row spatial comparison. Four additional method frame tables are used for selected visual overlays only where their source rows match; they do not change the aggregate summary population. Frozen selected-case and severity-grid manifests supply source, GT, perturbation and case identity. |
| `temporal.json` | V2.2 temporal metric JSON/CSV and raw per-seed observations. The synchronized TMS02/TMS07 visual cases preserve all frames and method-specific accepted, abstained, or unavailable states. |
| `runtime.json` | Common A5000 `TOURNAMENT.csv` and completion record. No frame-synchronized output media was retained for this protocol, so runtime cards carry explicit visual-evidence limitations. |
| `deployment.json` | Corrected 30-condition deployment matrix and the three executed INT8 result records. Display labels normalize backend/precision names while raw source labels remain in provenance. Formozov video outputs are a separate population and are not shown as G8 condition evidence. |
| `capabilities.json` | `METHOD_CAPABILITY_MATRIX_V2.csv`, exported as categorical evidence with unknown values preserved. |
| `visual_cases.json` | Hash-bound real-validation, Exact-GT V2.1 and temporal V2.2 media manifests, joined to method outputs by stable case/frame IDs, source and GT hashes, and row IDs. Where retained source-raster masks exist, the export includes native masks and derived TP/FP/FN comparison PNGs; it does not synthesize masks for geometry-only methods. |
| `WEBSITE_VISUAL_CASES.json` | Deterministic source/GT-only index derived from the frozen real-validation media manifest, including source-manifest hashes and explicit prediction-blind representative vs outcome-selected labels. |

The exporter explicitly excludes Allen/external evaluation and protected material. It leaves real-validation frame timestamps unavailable when the frozen media lineage has no timestamp or cadence evidence. Exact-GT severity controls select existing frozen corpus examples only: the corpus has blur, crop truncation, latent occlusion and one combined transform; standalone noise, ROI-shift, translation-sweep and scale-sweep examples are recorded as unavailable. On those 18 severity cases, the original color-coded primary GT remains at `reference.gt`; a separate hash-bound binary pupil-only PNG is exposed through `reference.mask` and geometry overlays so the visible-eye class cannot be mistaken for pupil pixels.

## Bounded Exact-GT mask staging

To recreate the retained-mask and TP/FP/FN PNGs from the read-only native arrays in the parent workspace, use the project analysis environment, then rebuild the data export:

```sh
remote_runs/benchmark_expansion_20260919/comparator_forensics_v7/envs/mouse-pupil-analysis-v0.2.0-local/bin/python benchmark_site/export/stage_exact_gt_severity_masks.py
remote_runs/benchmark_expansion_20260919/comparator_forensics_v7/envs/mouse-pupil-analysis-v0.2.0-local/bin/python benchmark_site/export/stage_exact_gt_severity_masks.py --verify-only
python3 benchmark_site/export/build_benchmark_data.py
python3 benchmark_site/export/build_benchmark_data.py --verify
```

The staging helper copies only the fixed selected rows after checking execution ID, row index, source and GT identity, native-array hash and raster dimensions. It does not run a model or rescore a metric. Exact-GT overlap maps use the canonical GT and byte-identical exported prediction masks in the same raster coordinate system; their legend reports true-positive, false-positive and false-negative pixels.
