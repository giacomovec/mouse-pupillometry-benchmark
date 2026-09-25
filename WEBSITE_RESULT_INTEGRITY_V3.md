# Benchmark presentation and deployment integrity

The site is a **development benchmark**. External evaluation is unopened. All displayed scientific values come from the versioned export; the website does not score models or choose thresholds.

## Primary measurement comparison

The corrected shared validation has 1,337 attempted frames across seven acquisition families. Diameter absolute relative error (ARE) is the unweighted acquisition-family macro mean among accepted frames; coverage is accepted divided by attempted frames. The site shows both together.

| Method | Native diameter ARE | Coverage |
|---|---:|---:|
| SegFormer B0 | 17.8861% | 95.1384% |
| SegFormer B1 | 18.3026% | 95.0636% |
| SegFormer B2 | 4.7909% | 95.0636% |
| Standard DLC, native | 2.2056% | 40.9125% |
| Pupil-DLC GM, native | 3.4397% | 17.8758% |
| Standard DLC, prospective near-95% point | 52.9930% | 95.0636% |
| Pupil-DLC GM, prospective near-95% point | 19.0349% | 95.0636% |

The native and prospective keypoint points are separate source rows. Their prospective thresholds were selected by coverage, not by error. The primary SegFormer and published-method rows come from `real_validation_v7/REAL_VALIDATION_SUMMARY.csv`; the prospective keypoint rows come from `KEYPOINT_COVERAGE_FORENSIC_V10.json`. Source paths and SHA-256 hashes are included in `public/data/provenance.json`.

Pupil-DLC Individual Model has no canonical scored condition yet. The exporter admits `pupil_dlc_im` into the primary published-method roster once a scored row enters the corrected source, and labels it **session-adapted**. It is not displayed with a fabricated value while its calibration-label budget and disjoint scoring contract remain open.

## Common speed comparison

The nine-method A5000 batch-one tournament is the only common runtime subset used in the main latency chart. SegFormer B0/B1/B2 end-to-end median latencies are 17.590660, 17.751826, and 26.643721 ms. The source is `closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv`; its completion record preserves qualified exclusions. Native CPU/video/folder workflows appear separately.

## SegFormer deployment cohorts

The deployment export contains 30 executed or measured records, with two distinct cohorts:

| Cohort | Records | Validation | Checkpoints | Use in the site |
|---|---:|---:|---|---|
| Corrected FP32/BF16/FP16 | 27 | 1,337 frames | Same selected checkpoint within each B0/B1/B2 family | Primary deployment frontier and FP32 output-fidelity comparison |
| Earlier TensorRT INT8 extension | 3 | 1,130 frames | Different from the corrected checkpoints | Separate measured extension; never joined to the corrected frontier or paired FP32 delta |

All three INT8 runs executed and failed **their own frozen ≥95% coverage gate**: B0 94.3363%, B1 94.2478%, and B2 94.1593%. This result does not measure what the corrected checkpoints would do under INT8. A same-checkpoint, 1,337-frame rerun would be required to join those points to the corrected deployment frontier.

Within the corrected deployment matrix, B1 and B2 PyTorch FP32 also record 94.9888% coverage, one frame below the gate. These deployment measurements are shown with their own status; the main real-validation B1/B2 points each record 95.0636% and are not substituted into deployment rows.

The 27 corrected variants have same-frame output-fidelity summaries in `results/deployment_summary/QUANTIZATION_PARITY.csv`, paired with each model's PyTorch FP32 output. The website export now includes median absolute diameter change, changed retention decisions, and median pupil-mask disagreement. The three INT8 values for these paired measures are explicitly unavailable. Per-metric paired `n` is preserved; the source contains aggregate distributions, not individual frame pairs.

## Export verification

`python3 export/build_benchmark_data.py --verify --output-dir public/data` checks canonical source hashes, every packaged output hash, and referenced media hashes. It also requires Allen scoring and legacy protected inference counters to remain zero. The current regenerated export has 149 quantitative cards, 30 deployment records, 58 visual cases, and no broken local assets.
