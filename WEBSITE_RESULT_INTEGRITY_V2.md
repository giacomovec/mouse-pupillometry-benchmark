# Website result integrity v2

Independent values checked from the rendered figure/table input through its generated JSON and its hash-bound canonical input. These checks use the exact fields consumed by `src/App.tsx`; `python3 qa/spot_check_v2.py` regenerates this record and fails on disagreement.

| UI figure/table input | Condition | Display value | Canonical source |
|---|---|---:|---|
| Published benchmark ARE + coverage | segformer_b0, native | 17.886147% ARE; 95.14% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Published benchmark ARE + coverage | segformer_b1, native | 18.302586% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Published benchmark ARE + coverage | segformer_b2, native | 4.790875% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Published benchmark ARE + coverage | standard_dlc_matched, native | 2.205556% ARE; 40.91% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Published benchmark ARE + coverage | pupil_dlc_gm, native | 3.439727% ARE; 17.88% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Published benchmark ARE + coverage | meye_released, native | 6.405355% ARE; 98.35% coverage | `parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv` |
| Practical-coverage comparison | standard_dlc_matched, prospective 95% | 52.993045% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/KEYPOINT_COVERAGE_FORENSIC_V10.json` |
| Practical-coverage comparison | pupil_dlc_gm, prospective 95% | 19.034885% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/KEYPOINT_COVERAGE_FORENSIC_V10.json` |
| Methods architecture control | unet_small | 4.143334% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/UNET_VS_SEGFORMER_FINAL.csv` |
| Methods architecture control | unet_base | 4.418547% ARE; 95.59% coverage | `parallel_handoffs/benchmark_expansion_20260919/UNET_VS_SEGFORMER_FINAL.csv` |
| Methods architecture control | unet_b2_matched | 3.677484% ARE; 95.06% coverage | `parallel_handoffs/benchmark_expansion_20260919/UNET_VS_SEGFORMER_FINAL.csv` |
| Exact-GT severity cell | segformer_b2, motion_blur 5 | 35.549972% ARE; 14/14 retained | `parallel_handoffs/benchmark_expansion_20260919/exact_gt_execution_v2_1/segformer_b2_v21/FRAME_METRICS.csv` |
| Exact-GT severity cell | segformer_b2, latent_occlusion 0.5 | 330.339668% ARE; 14/14 retained | `parallel_handoffs/benchmark_expansion_20260919/exact_gt_execution_v2_1/segformer_b2_v21/FRAME_METRICS.csv` |
| Exact-GT severity cell | unet_b2_matched, crop_truncation 0.5 | 148.212221% ARE; 56/56 retained | `parallel_handoffs/benchmark_expansion_20260919/closure_unet_exact_gt_v21/collected/b2_matched/FRAME_METRICS.csv` |
| Temporal seed-specific plot | segformer_b2, TMS01, diameterRmsePx | 0.946189 | `parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/interim_ten_methods_meye_matched_20260923/PER_SEED.csv` |
| Temporal seed-specific plot | meye_matched, TMS02, sine3HzGain | 0.869297 | `parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/interim_ten_methods_meye_matched_20260923/PER_SEED.csv` |
| Temporal seed-specific plot | mouse_pupil_analysis_v020, TMS03, sine3HzPhaseLagSec | 0.000362 | `parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/interim_ten_methods_meye_matched_20260923/PER_SEED.csv` |
| Common A5000 latency plot | segformer_b0 | 17.590660 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv` |
| Common A5000 latency plot | segformer_b1 | 17.751826 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv` |
| Common A5000 latency plot | segformer_b2 | 26.643721 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv` |
| Deployment frontier | B0 PyTorch FP32 | 41.022175 ms p50 | `parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/SEGFORMER_DEPLOYMENT_MATRIX.csv` |
| Deployment frontier | B1 PyTorch FP32 | 40.858996 ms p50 | `parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/SEGFORMER_DEPLOYMENT_MATRIX.csv` |
| Deployment frontier | B2 PyTorch FP32 | 53.793401 ms p50 | `parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/SEGFORMER_DEPLOYMENT_MATRIX.csv` |
| Separate native CPU plot | classical_fixed | 1.829438 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/runtime_benchmark/population_v2/CONTROLLED_CPU_RUNTIME_POPULATION.csv` |
| Separate native CPU plot | mouse_pupil_analysis_v020 | 8.764917 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/runtime_benchmark/population_v2/CONTROLLED_CPU_RUNTIME_POPULATION.csv` |
| Separate native CPU plot | pypupilext_purest_v001 | 0.740751 ms p50 | `parallel_handoffs/benchmark_expansion_20260919/runtime_benchmark/population_v2/CONTROLLED_CPU_RUNTIME_POPULATION.csv` |

All 23 values matched. Percent conversions are explicit. Exact-GT cell means use only valid frame scores, retain the attempted denominator, and carry no inferred CI. Native CPU latency remains separate from the common A5000 frontier.
