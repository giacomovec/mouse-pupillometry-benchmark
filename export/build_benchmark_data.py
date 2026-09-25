#!/usr/bin/env python3
"""Build the deterministic, static benchmark-site data export.

All scientific values are read from the whitelisted canonical CSV/JSON inputs
below. This module does not rerun models, aggregate frame-level benchmark
results, or estimate missing values.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SITE_ROOT = Path(__file__).resolve().parents[1]
if (SITE_ROOT.parent / "parallel_handoffs").is_dir():
    ROOT = SITE_ROOT.parent
elif (SITE_ROOT / "parallel_handoffs").is_dir():
    ROOT = SITE_ROOT
else:
    # Standalone website checkout: data-build inputs are absent, but export-only
    # verification can still run from the packaged site's own public directory.
    ROOT = SITE_ROOT.parent
DEFAULT_OUT = SITE_ROOT / "public" / "data"
EXP = "parallel_handoffs/benchmark_expansion_20260919"
DEPLOY = "parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/SEGFORMER_DEPLOYMENT_MATRIX.csv"
DEPLOY_PARITY = "parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/QUANTIZATION_PARITY.csv"
SCHEMA_VERSION = "mouse-pupillometry-benchmark-export.v2"
OVERVIEW_SCHEMA = "mouse-pupillometry-overview.v2"
REAL_VALIDATION_REGISTRY_SCHEMA = "mouse-pupillometry-real-validation-registry.v2"
VISUAL_CASE_INDEX_SCHEMA = "mouse-pupillometry-visual-case-index.v2"

# Inputs are deliberately explicit. In particular, no source under external_gold,
# v2/allen*, or protected material is read by this exporter.
IDENTITY_PATH = f"{EXP}/METHOD_VISUAL_IDENTITY_V2.json"
REAL_PAYLOAD_PATH = f"{EXP}/real_validation_v7/REAL_VALIDATION_DASHBOARD_PAYLOAD.json"
REAL_SUMMARY_PATH = f"{EXP}/real_validation_v7/REAL_VALIDATION_SUMMARY.csv"
REAL_EVIDENCE_PATH = f"{EXP}/real_validation_v7/REAL_VALIDATION_EVIDENCE.csv"
FEATURE_ATLAS_PATH = f"{EXP}/benchmark_ui_v10/BENCHMARK_UI_DATA.json"
KEYPOINT_COVERAGE_PATH = f"{EXP}/KEYPOINT_COVERAGE_FORENSIC_V10.json"
MPA_MAPPING_FIXED_SUMMARY_PATH = f"{EXP}/comparator_execution_v7/mouse_pupil_analysis_v020_static_v3_mapping_fixed/SUMMARY.json"
MPA_MAPPING_FIXED_MANIFEST_PATH = f"{EXP}/comparator_execution_v7/mouse_pupil_analysis_v020_static_v3_mapping_fixed/RUN_MANIFEST.json"
MPA_MAPPING_FIXED_FRAMES_PATH = f"{EXP}/comparator_execution_v7/mouse_pupil_analysis_v020_static_v3_mapping_fixed/FRAME_METRICS.csv"
TEMPORAL_CANONICAL_COMPLETION_PATH = f"{EXP}/MEYE_RELEASED_V22_TEMPORAL_COMPLETION_20260923.json"
NATIVE_CPU_RUNTIME_CSV_PATH = f"{EXP}/runtime_benchmark/population_v2/CONTROLLED_CPU_RUNTIME_POPULATION.csv"
NATIVE_CPU_RUNTIME_VERIFICATION_PATH = f"{EXP}/runtime_benchmark/population_v2/VERIFICATION.json"
UNET_PATH = f"{EXP}/UNET_VS_SEGFORMER_FINAL.csv"
CAPABILITIES_PATH = f"{EXP}/METHOD_CAPABILITY_MATRIX_V2.csv"
RUNTIME_CSV_PATH = f"{EXP}/closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv"
RUNTIME_COMPLETION_PATH = f"{EXP}/COMMON_A5000_RUNTIME_TOURNAMENT_COMPLETION_20260923.json"
MEDIA_MANIFEST_PATH = "benchmark_site/media_export/website_visual_media_manifest.json"
EXACT_GT_PRIOR_MASK_CANDIDATE_PATH = f"{EXP}/visual_qc_prior_worst_20260924_v1/EXACT_GT_V21_PRIOR_METHOD_SELECTED_NATIVE_MEDIA_V1.json"
EXACT_GT_PREDICTION_MEDIA_MANIFEST_PATH = f"{EXP}/visual_qc_prior_worst_20260924_v1/EXACT_GT_V21_PUBLIC_PREDICTION_MEDIA_HASH_MANIFEST_V1.json"
INT8_DIR = f"{EXP}/int8_extension"
TEMPORAL_SEED_PATH = f"{EXP}/temporal_v22_results/interim_ten_methods_meye_matched_20260923/PER_SEED.csv"
TEMPORAL_SEED_MANIFEST_PATH = f"{EXP}/temporal_v22_results/interim_ten_methods_meye_matched_20260923/MANIFEST.json"
TEMPORAL_VISUAL_MANIFEST_PATH = "benchmark_site/media_export/temporal_visual_cases_v1.json"
EXACT_GT_SEVERITY_MEDIA_MANIFEST_PATH = "benchmark_site/media_export/exact_gt_v21_severity_grid_v1.json"
EXACT_GT_SEVERITY_PREDICTION_MEDIA_MANIFEST_PATH = "benchmark_site/media_export/exact_gt_v21_severity_prediction_masks_v1.json"
EXACT_GT_SEVERITY_PUPIL_GT_MEDIA_MANIFEST_PATH = "benchmark_site/media_export/exact_gt_v21_severity_pupil_gt_v1.json"
EXACT_GT_PREDICTION_COMPARISON_MANIFEST_PATH = "benchmark_site/media_export/exact_gt_v21_prediction_comparison_media_v1.json"
TEMPORAL_VISUAL_METHOD_IDS = (
    "mouse_pupil_analysis_v020", "segformer_b0", "segformer_b1", "segformer_b2",
    "unet_small", "unet_base", "unet_b2_matched", "meye_released", "meye_matched",
    "standard_dlc_matched", "pupil_dlc_gm",
)
METHOD_IDENTITY_ALIASES = {
    "unet_small": "vanilla_unet_small",
    "unet_small_matched": "vanilla_unet_small",
    "unet_base": "vanilla_unet_base",
    "unet_base_matched": "vanilla_unet_base",
    "unet_b2_matched": "vanilla_unet_large",
}
PUBLISHED_PRIMARY_METHOD_IDS = {
    "segformer_b0", "segformer_b1", "segformer_b2", "meye_released",
    "standard_dlc_matched", "pupil_dlc_gm", "pupil_dlc_im", "dlc_zoo_mouse_pupil_vclose",
    "neuropupil_animal", "mouse_pupil_analysis_v020", "classical_fixed",
}
ROSTER_ROLE_BY_METHOD = {
    "segformer_b0": "INTERNAL_CUSTOM", "segformer_b1": "INTERNAL_CUSTOM", "segformer_b2": "INTERNAL_CUSTOM",
    "unet_small": "MATCHED_CONTROL", "unet_base": "MATCHED_CONTROL", "unet_b2_matched": "MATCHED_CONTROL",
    "meye_released": "PUBLISHED", "meye_matched": "MATCHED_CONTROL",
    "standard_dlc_matched": "PUBLISHED", "pupil_dlc_gm": "PUBLISHED", "pupil_dlc_im": "PUBLISHED",
    "dlc_zoo_mouse_pupil_vclose": "PUBLISHED", "neuropupil_animal": "PUBLISHED",
    "mouse_pupil_analysis_v020": "PUBLISHED", "classical_fixed": "INTERNAL_CUSTOM",
    "facemap_raw": "NATIVE_WORKFLOW_ONLY", "facemap_processed": "NATIVE_WORKFLOW_ONLY", "eyeloop": "NATIVE_WORKFLOW_ONLY",
}

TEMPORAL_METRIC_PATHS = [
    f"{EXP}/temporal_v22_results/mouse-pupil-analysis-v0.2.0_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/b0_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/b1_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/b2_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/small_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/base_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/b2_matched_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/meye_released_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/standard_dlc_matched_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/temporal_v22_results/pupil_dlc_gm_scored_v2/TEMPORAL_METRICS.json",
    f"{EXP}/closure_meye_matched_temporal_v22/scored/meye_matched_temporal_v22/TEMPORAL_METRICS.json",
]

EXACT_GT_SOURCES = [
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/classical_fixed_v1/SUMMARY.json",
        "score_manifest": None,
        "method_id": "classical_fixed",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native fixed dark-component geometry and mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_else_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "else",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_excuse_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "excuse",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_pure_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "pure",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_purest_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "purest",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_starburst_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "starburst",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/exact_gt_execution_v2_1/pypupilext_swirski2d_v001/SUMMARY.json",
        "score_manifest": None,
        "method_id": "swirski2d",
        "metric_path": ["spatial"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native ellipse output; no native pupil mask",
    },
    {
        "path": f"{EXP}/closure_meye_exact_gt_v21/collected/meye_released/scored/SUMMARY.json",
        "score_manifest": f"{EXP}/closure_meye_exact_gt_v21/collected/meye_released/scored/SCORE_MANIFEST.json",
        "method_id": "meye_released",
        "metric_path": [],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native mask with common geometry scoring",
    },
    {
        "path": f"{EXP}/closure_meye_matched_exact_gt_v21/scored/meye_matched_spatial_v21/SUMMARY.json",
        "score_manifest": f"{EXP}/closure_meye_matched_exact_gt_v21/scored/meye_matched_spatial_v21/SCORE_MANIFEST.json",
        "method_id": "meye_matched",
        "metric_path": [],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native mask with common geometry scoring",
    },
    {
        "path": f"{EXP}/closure_unet_exact_gt_v21/collected/small/SUMMARY.json",
        "score_manifest": f"{EXP}/closure_unet_exact_gt_v21/collected/small/SCORE_MANIFEST.json",
        "method_id": "unet_small",
        "metric_path": [],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native mask with common geometry scoring",
    },
    {
        "path": f"{EXP}/closure_unet_exact_gt_v21/collected/base/SUMMARY.json",
        "score_manifest": f"{EXP}/closure_unet_exact_gt_v21/collected/base/SCORE_MANIFEST.json",
        "method_id": "unet_base",
        "metric_path": [],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native mask with common geometry scoring",
    },
    {
        "path": f"{EXP}/closure_unet_exact_gt_v21/collected/b2_matched/SUMMARY.json",
        "score_manifest": f"{EXP}/closure_unet_exact_gt_v21/collected/b2_matched/SCORE_MANIFEST.json",
        "method_id": "unet_b2_matched",
        "metric_path": [],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native mask with common geometry scoring",
    },
    {
        "path": f"{EXP}/closure_dlc_zoo_exact_gt_v21/results/dlc_zoo_v21_spatial_geometry_only/SUMMARY_GEOMETRY_ONLY.json",
        "score_manifest": f"{EXP}/closure_dlc_zoo_exact_gt_v21/results/dlc_zoo_v21_spatial_geometry_only/SCORE_MANIFEST.json",
        "method_id": "dlc_zoo_mouse_pupil_vclose",
        "metric_path": ["total", "mean_on_accepted"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native keypoints/fitted geometry; geometry only",
    },
    {
        "path": f"{EXP}/closure_neuropupil_spatial_v21/results/neuropupil_v21_spatial_scored_geometry_only/SUMMARY_GEOMETRY_ONLY.json",
        "score_manifest": None,
        "method_id": "neuropupil_animal",
        "metric_path": ["total", "mean_on_accepted"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native four-point geometry only",
    },
    {
        "path": f"{EXP}/closure_standard_dlc_spatial_v21/results/standard_dlc_v21_spatial_scored_geometry_only/SUMMARY_GEOMETRY_ONLY.json",
        "score_manifest": None,
        "method_id": "standard_dlc_matched",
        "metric_path": ["total", "mean_on_accepted"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native keypoint/ellipse geometry only",
    },
    {
        "path": f"{EXP}/closure_pupil_dlc_gm_exact_gt_v21/results/pupil_dlc_gm_v21_spatial_geometry_only_v4/SUMMARY_GEOMETRY_ONLY.json",
        "score_manifest": f"{EXP}/closure_pupil_dlc_gm_exact_gt_v21/results/pupil_dlc_gm_v21_spatial_geometry_only_v4/SCORE_MANIFEST.json",
        "method_id": "pupil_dlc_gm",
        "metric_path": ["total", "mean_on_accepted"],
        "population": "Exact-GT V2.1 spatial corpus",
        "representation": "native keypoints/fitted geometry; geometry only",
    },
]

# Frozen, per-row V2.1 scores are used only to populate matching visual cases.
# Each row is joined by execution ID and then verified against the selected
# transformed-source and exact-GT hashes before it is exported.
EXACT_GT_FRAME_METRIC_PATHS = {
    "mouse_pupil_analysis_v020": f"{EXP}/exact_gt_execution_v2_1/mouse_pupil_analysis_v020/FRAME_METRICS.csv",
    "segformer_b0": f"{EXP}/exact_gt_execution_v2_1/segformer_b0_v21/FRAME_METRICS.csv",
    "segformer_b1": f"{EXP}/exact_gt_execution_v2_1/segformer_b1_v21/FRAME_METRICS.csv",
    "segformer_b2": f"{EXP}/exact_gt_execution_v2_1/segformer_b2_v21/FRAME_METRICS.csv",
    "classical_fixed": f"{EXP}/exact_gt_execution_v2_1/classical_fixed_v1/FRAME_METRICS.csv",
    "else": f"{EXP}/exact_gt_execution_v2_1/pypupilext_else_v001/FRAME_METRICS.csv",
    "excuse": f"{EXP}/exact_gt_execution_v2_1/pypupilext_excuse_v001/FRAME_METRICS.csv",
    "pure": f"{EXP}/exact_gt_execution_v2_1/pypupilext_pure_v001/FRAME_METRICS.csv",
    "purest": f"{EXP}/exact_gt_execution_v2_1/pypupilext_purest_v001/FRAME_METRICS.csv",
    "starburst": f"{EXP}/exact_gt_execution_v2_1/pypupilext_starburst_v001/FRAME_METRICS.csv",
    "swirski2d": f"{EXP}/exact_gt_execution_v2_1/pypupilext_swirski2d_v001/FRAME_METRICS.csv",
    "meye_released": f"{EXP}/closure_meye_exact_gt_v21/collected/meye_released/scored/FRAME_METRICS.csv",
    "meye_matched": f"{EXP}/closure_meye_matched_exact_gt_v21/scored/meye_matched_spatial_v21/FRAME_METRICS.csv",
    "unet_small": f"{EXP}/closure_unet_exact_gt_v21/collected/small/FRAME_METRICS.csv",
    "unet_base": f"{EXP}/closure_unet_exact_gt_v21/collected/base/FRAME_METRICS.csv",
    "unet_b2_matched": f"{EXP}/closure_unet_exact_gt_v21/collected/b2_matched/FRAME_METRICS.csv",
    "dlc_zoo_mouse_pupil_vclose": f"{EXP}/closure_dlc_zoo_exact_gt_v21/results/dlc_zoo_v21_spatial_geometry_only/FRAME_GEOMETRY_METRICS.csv",
    "neuropupil_animal": f"{EXP}/closure_neuropupil_spatial_v21/results/neuropupil_v21_spatial_scored_geometry_only/FRAME_GEOMETRY_METRICS.csv",
    "standard_dlc_matched": f"{EXP}/closure_standard_dlc_spatial_v21/results/standard_dlc_v21_spatial_scored_geometry_only/FRAME_GEOMETRY_METRICS.csv",
    "pupil_dlc_gm": f"{EXP}/closure_pupil_dlc_gm_exact_gt_v21/results/pupil_dlc_gm_v21_spatial_geometry_only_v4/FRAME_GEOMETRY_METRICS.csv",
}
EXACT_GT_EXTRA_VISUAL_METHOD_IDS = (
    "mouse_pupil_analysis_v020", "segformer_b0", "segformer_b1", "segformer_b2",
)

METRIC_DEFS = {
    "diameter_are": ("Pupil diameter ARE", "ARE ratio", "lower", "geometry"),
    "diameter_mae_px": ("Pupil diameter MAE", "px", "lower", "geometry"),
    "diameter_signed_error_px": ("Pupil diameter signed error", "px", "target", "geometry"),
    "center_error_px": ("Pupil center error", "px", "lower", "geometry"),
    "area_are": ("Pupil area ARE", "ARE ratio", "lower", "geometry"),
    "major_axis_are": ("Major-axis ARE", "ARE ratio", "lower", "geometry"),
    "minor_axis_are": ("Minor-axis ARE", "ARE ratio", "lower", "geometry"),
    "orientation_error_deg": ("Orientation error", "degrees", "lower", "geometry"),
    "dice": ("Pupil mask Dice", "score", "higher", "segmentation"),
    "iou": ("Pupil mask IoU", "score", "higher", "segmentation"),
    "assd_px": ("Pupil boundary ASSD", "px", "lower", "segmentation"),
    "hd95_px": ("Pupil boundary HD95", "px", "lower", "segmentation"),
}

UNET_METRIC_DEFS = [
    ("family_macro_diameter_are", "Family-macro diameter ARE", "fraction", "lower", "geometry", "Family-macro summary over the corrected seven-family validation set."),
    ("retained_diameter_mae_px", "Retained diameter MAE", "px", "lower", "geometry", "Conditional on retained frames; coverage is shown separately."),
    ("retained_diameter_mean_are", "Retained diameter mean ARE", "fraction", "lower", "geometry", "Conditional on retained frames."),
    ("retained_diameter_median_are", "Retained diameter median ARE", "fraction", "lower", "geometry", "Conditional on retained frames."),
    ("retained_diameter_p95_are", "Retained diameter P95 ARE", "fraction", "lower", "geometry", "Conditional on retained frames."),
    ("retained_diameter_p99_are", "Retained diameter P99 ARE", "fraction", "lower", "geometry", "Conditional on retained frames."),
    ("retained_diameter_rmse_px", "Retained diameter RMSE", "px", "lower", "geometry", "Conditional on retained frames."),
    ("retained_diameter_signed_bias_px", "Retained diameter signed bias", "px", "target", "geometry", "Signed error; target is zero."),
    ("retained_catastrophic_gt20_fraction", "Retained diameter errors above 20%", "fraction", "lower", "coverage_risk", "Fraction of retained frames exceeding the frozen 20% error criterion."),
    ("coverage", "Validation frame coverage", "fraction", "higher", "coverage_risk", "Fraction of attempted frames retained at the frozen operating point."),
    ("retained_pupil_centroid_error_px_mean", "Pupil centroid error", "px", "lower", "geometry", "Mean error on retained frames."),
    ("retained_pupil_area_are_mean", "Pupil mask area ARE", "fraction", "lower", "geometry", "Mean absolute relative error on retained frames."),
    ("retained_pupil_major_are_mean", "Pupil major-axis ARE", "fraction", "lower", "geometry", "Mean absolute relative error on retained frames."),
    ("retained_pupil_minor_are_mean", "Pupil minor-axis ARE", "fraction", "lower", "geometry", "Mean absolute relative error on retained frames."),
    ("retained_pupil_dice_mean", "Pupil mask Dice", "score", "higher", "segmentation", "Mean Dice on retained frames."),
    ("retained_pupil_iou_mean", "Pupil mask IoU", "score", "higher", "segmentation", "Mean IoU on retained frames."),
    ("retained_pupil_boundary_assd_mean", "Pupil boundary ASSD", "px", "lower", "segmentation", "Mean symmetric surface distance on retained frames."),
    ("retained_pupil_boundary_hd95_mean", "Pupil boundary HD95", "px", "lower", "segmentation", "95th-percentile Hausdorff distance on retained frames."),
    ("retained_pupil_boundary_bf1_1_mean", "Pupil boundary F1 at 1 px", "score", "higher", "segmentation", "Boundary F1 at the source-defined 1 px tolerance."),
    ("retained_pupil_boundary_bf1_2_mean", "Pupil boundary F1 at 2 px", "score", "higher", "segmentation", "Boundary F1 at the source-defined 2 px tolerance."),
    ("retained_pupil_boundary_bf1_4_mean", "Pupil boundary F1 at 4 px", "score", "higher", "segmentation", "Boundary F1 at the source-defined 4 px tolerance."),
    ("retained_pupil_eye_nesting_violation_pixels_c512_mean", "Pupil outside eye mask", "pixels", "lower", "segmentation", "Mean nested-mask violation pixels in the source-defined C512 coordinate space."),
]

TEMPORAL_METRIC_DEFS = {
    "center_acceleration_error_rmse_px_per_sec2": ("Center acceleration error", "px/s²", "lower", "temporal"),
    "center_frame_delta_rmse_px": ("Center frame-to-frame delta RMSE", "px", "lower", "temporal"),
    "center_trajectory_rmse_px": ("Center trajectory RMSE", "px", "lower", "temporal"),
    "center_velocity_error_rmse_px_per_sec": ("Center velocity error", "px/s", "lower", "temporal"),
    "center_x_high_frequency_residual_power_px2": ("Center X high-frequency residual power", "px²", "lower", "temporal"),
    "center_y_high_frequency_residual_power_px2": ("Center Y high-frequency residual power", "px²", "lower", "temporal"),
    "coverage": ("Mean temporal sequence coverage", "fraction", "higher", "coverage_risk"),
    "diameter_acceleration_error_rmse_px_per_sec2": ("Diameter acceleration error", "px/s²", "lower", "temporal"),
    "diameter_frame_delta_rmse_px": ("Diameter frame-to-frame delta RMSE", "px", "lower", "temporal"),
    "diameter_high_frequency_residual_power_px2": ("Diameter high-frequency residual power", "px²", "lower", "temporal"),
    "diameter_step_gain": ("Diameter step gain", "ratio", "target", "temporal"),
    "diameter_step_onset_error_frames": ("Diameter step onset error", "frames", "lower", "temporal"),
    "diameter_trajectory_rmse_px": ("Diameter trajectory RMSE", "px", "lower", "temporal"),
    "diameter_velocity_error_rmse_px_per_sec": ("Diameter velocity error", "px/s", "lower", "temporal"),
    "dropped_frame_recovery_error_px": ("Dropped-frame recovery error", "px", "lower", "temporal"),
    "false_static_center_jitter_px": ("False static center jitter", "px", "lower", "temporal"),
    "false_static_diameter_jitter_px": ("False static diameter jitter", "px", "lower", "temporal"),
    "occlusion_recovery_delay_frames": ("Occlusion recovery delay", "frames", "lower", "temporal"),
    "position_step_gain": ("Center-position step gain", "ratio", "target", "temporal"),
    "position_step_onset_error_frames": ("Center-position step onset error", "frames", "lower", "temporal"),
    "saccade_recovery_delay_frames": ("Saccade recovery delay", "frames", "lower", "temporal"),
}

_INPUTS: dict[str, dict[str, Any]] = {}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_relative(path: Path) -> str:
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(ROOT.resolve()).as_posix()
    except ValueError as exc:
        raise ValueError(f"Input escapes the project root: {path}") from exc
    lowered = relative.lower()
    if any(token in lowered.split("/") for token in ("external_gold", "allen", "protected")):
        raise ValueError(f"Protected/Allen input is not permitted: {relative}")
    return relative


def input_path(relative: str) -> Path:
    candidate = ROOT / relative
    safe_relative(candidate)
    if not candidate.is_file():
        raise FileNotFoundError(f"Required canonical input is missing: {relative}")
    return candidate


def register_input(path: Path, role: str) -> dict[str, Any]:
    relative = safe_relative(path)
    if relative not in _INPUTS:
        _INPUTS[relative] = {
            "path": relative,
            "sha256": sha256_file(path),
            "sizeBytes": path.stat().st_size,
            "roles": [],
        }
    if role not in _INPUTS[relative]["roles"]:
        _INPUTS[relative]["roles"].append(role)
    return _INPUTS[relative]


def read_json(relative: str, role: str) -> tuple[Any, dict[str, Any]]:
    path = input_path(relative)
    info = register_input(path, role)
    return json.loads(path.read_text(encoding="utf-8")), info


def read_csv(relative: str, role: str) -> tuple[list[dict[str, str]], dict[str, Any]]:
    path = input_path(relative)
    info = register_input(path, role)
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream)), info


def read_external_csv_reference(path_string: str, expected_sha: str, role: str) -> tuple[list[dict[str, str]], dict[str, Any]]:
    raw_path = Path(path_string)
    resolved = raw_path if raw_path.is_absolute() else ROOT / raw_path
    relative = safe_relative(resolved)
    path = input_path(relative)
    actual_sha = sha256_file(path)
    if expected_sha and actual_sha.lower() != expected_sha.lower():
        raise ValueError(f"SHA-256 mismatch for canonical frame metrics source: {relative}")
    info = register_input(path, role)
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream)), info


def as_number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(result):
        return None
    if result.is_integer():
        return int(result)
    return result


def as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return None
    return str(value).strip().lower() in {"true", "1", "yes", "accepted", "pass"}


def walk_path(value: Any, path: Iterable[str]) -> Any:
    current = value
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def sanitize_source_reference(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)
    lowered = text.lower()
    if any(token in lowered for token in ("allen", "protected", "external_gold")):
        return None
    if text.startswith(("https://", "http://")):
        return text
    if text.startswith("/"):
        # Source matrices occasionally contain another machine's absolute path.
        # Keep only a local project-relative path when possible, else omit it.
        candidate = Path(text)
        try:
            return candidate.resolve().relative_to(ROOT.resolve()).as_posix()
        except (ValueError, OSError):
            return None
    return PurePosixPath(text).as_posix()


def direction_value(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if "higher" in raw:
        return "higher"
    if "lower" in raw:
        return "lower"
    if "target" in raw:
        return "target"
    return "descriptive"


def get_identity_maps(identity: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    variant_by_method = {str(row["method_id"]): row for row in identity.get("variants", []) if row.get("method_id")}
    families = {str(row["family_id"]): row for row in identity.get("families", []) if row.get("family_id")}
    return variant_by_method, families


def method_base(
    method_id: str,
    variant_by_method: dict[str, dict[str, Any]],
    families: dict[str, dict[str, Any]],
    *,
    method_name: str | None = None,
    family_id: str | None = None,
    representation: str | None = None,
    operating_point: str | None = None,
    canonical: bool | None = None,
) -> dict[str, Any]:
    # Aggregation tables use readable aliases; preserve their method IDs while
    # reusing permanent visual shades from the canonical identity registry.
    variant = variant_by_method.get(method_id) or variant_by_method.get(METHOD_IDENTITY_ALIASES.get(method_id, ""), {})
    resolved_family = family_id or variant.get("family_id") or "unknown"
    family = families.get(str(resolved_family), {})
    label = method_name or variant.get("label") or method_id.replace("_", " ")
    out: dict[str, Any] = {
        "methodId": method_id,
        "methodName": label,
        "family": resolved_family,
        "familyId": resolved_family,
        "architecture": method_id,
        "representation": representation or variant.get("representation"),
        "operatingPoint": operating_point,
        "colorKey": method_id,
        "color": variant.get("color") or variant.get("family_color") or family.get("color"),
        "familyColor": variant.get("family_color") or family.get("color"),
        "canonical": bool(canonical) if canonical is not None else False,
        "isCanonical": bool(canonical) if canonical is not None else False,
    }
    if variant.get("native_or_matched"):
        out["nativeOrMatched"] = variant["native_or_matched"]
    return out


def add_category_card(categories: dict[str, list[dict[str, Any]]], category: str, card: dict[str, Any]) -> None:
    card["category"] = category
    categories[category].append(card)


def card_base(
    *, card_id: str, title: str, category: str, explanation: str,
    direction: str, unit: str, source_population: str,
    n: int | float | None = None, acquisition_families: list[str] | None = None,
    canonical_condition: str | None = None, methods: list[dict[str, Any]] | None = None,
    provenance: dict[str, Any] | None = None, visual_case_ids: list[str] | None = None,
    overlay_type: str | None = None, runtime_protocol: str | None = None,
    visual_evidence_unavailable_reason: str | None = None,
) -> dict[str, Any]:
    card = {
        "id": card_id,
        "title": title,
        "category": category,
        "explanation": explanation,
        "direction": direction,
        "unit": unit,
        "n": n,
        "sourcePopulation": source_population,
        "acquisitionFamilies": acquisition_families or [],
        "canonicalCondition": canonical_condition,
        "methods": methods or [],
        "provenance": provenance or {},
        "visualCaseIds": visual_case_ids or [],
        "overlayType": overlay_type or category,
        "runtimeProtocol": runtime_protocol,
        "visualEvidenceUnavailableReason": visual_evidence_unavailable_reason,
    }
    if direction == "target":
        card["targetValue"] = 1 if "gain" in card_id.lower() else 0
    return card


def available_or_not(
    value: Any,
    *,
    status: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    numeric = as_number(value)
    if numeric is None:
        return {
            "value": None,
            "unavailable": True,
            "status": status or "NOT_MEASURED",
            "unavailableReason": reason or "No canonical value is present in the selected source summary.",
        }
    return {
        "value": numeric,
        "unavailable": False,
        "status": status or "MEASURED",
        "unavailableReason": None,
    }


def parse_real_validation(
    identity: dict[str, Any],
    categories: dict[str, list[dict[str, Any]]],
    all_method_ids: set[str],
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, Any]]:
    payload, payload_info = read_json(REAL_PAYLOAD_PATH, "real validation dashboard cards")
    summary_rows, summary_info = read_csv(REAL_SUMMARY_PATH, "real validation method-level summaries")
    evidence_rows, evidence_info = read_csv(REAL_EVIDENCE_PATH, "real validation score provenance and frame-metric links")
    variant_by_method, family_map = get_identity_maps(identity)
    summary_map = {(r.get("plane", ""), r.get("method_id", "")): r for r in summary_rows}
    evidence_map = {(r.get("plane", ""), r.get("method_id", "")): r for r in evidence_rows}
    # Acquisition-family IDs are filled from the linked corrected per-frame
    # tables after the evidence join. The method family_id in the summary is a
    # model-family field and must not be presented as an acquisition family.
    methods_by_id: dict[str, dict[str, Any]] = {}
    for row in summary_rows:
        method_id = row.get("method_id", "")
        if not method_id:
            continue
        all_method_ids.add(method_id)
        methods_by_id.setdefault(method_id, row)

    visual_manifest = None
    visual_manifest_info = None
    visual_case_ids: list[str] = []
    media_path = ROOT / MEDIA_MANIFEST_PATH
    if media_path.is_file():
        visual_manifest, visual_manifest_info = read_json(MEDIA_MANIFEST_PATH, "bounded visual evidence media manifest")
        visual_case_ids = [str(c.get("id") or c.get("caseId")) for c in visual_manifest.get("cases", []) if c.get("id") or c.get("caseId")]

    for source_card in payload.get("cards", []):
        method_records = []
        card_plane = None
        for raw in source_card.get("methods", []):
            method_id = str(raw.get("method_id") or "")
            evidence_id = str(raw.get("evidence_id") or "")
            parts = evidence_id.split("::")
            plane = parts[1] if len(parts) > 2 else "shared_scalar_mask_gt"
            card_plane = card_plane or plane
            summary = summary_map.get((plane, method_id), {})
            evidence = evidence_map.get((plane, method_id), {})
            method_name = raw.get("label") or summary.get("label")
            record = method_base(
                method_id, variant_by_method, family_map,
                method_name=method_name,
                family_id=str(raw.get("family_id") or summary.get("family_id") or "unknown"),
                representation=summary.get("representation"),
                operating_point=summary.get("condition"),
                canonical=True,
            )
            value = raw.get("value")
            status = str(raw.get("status") or "NOT_MEASURED")
            availability = available_or_not(value, status=status,
                reason=("Canonical dashboard source marks this value unavailable." if as_number(value) is None else None))
            record.update(availability)
            record.update({
                "n": as_number(summary.get("retained")),
                "acceptedCount": as_number(summary.get("retained")),
                "totalCount": as_number(summary.get("attempted")),
                "checkpointHash": evidence.get("checkpoint_sha256") or None,
                "scoreManifestHash": evidence.get("validation_manifest_sha256") or None,
                "operatingThreshold": as_number(summary.get("primary_confidence_cutoff")),
                "provenance": {
                    "evidenceId": raw.get("evidence_id"),
                    "plane": plane,
                    "condition": summary.get("condition"),
                    "representation": summary.get("representation"),
                    "frameMetricsSha256": evidence.get("frame_metrics_sha256") or None,
                },
                "visualCaseIds": visual_case_ids,
                "coverageGate95pct": raw.get("coverage_gate_95pct"),
            })
            if method_id not in methods_by_id:
                methods_by_id[method_id] = {"method_id": method_id, "label": method_name, "family_id": record.get("familyId"), "isCanonical": True}
            else:
                methods_by_id[method_id]["isCanonical"] = True
            method_records.append(record)
        if not method_records:
            continue
        metric_id = str(source_card.get("id", "real-validation-metric"))
        card_category = "coverage_risk" if ("coverage" in metric_id or "catastrophic" in metric_id) else "geometry"
        attempted_values = [m.get("totalCount") for m in method_records if isinstance(m.get("totalCount"), (int, float))]
        n = max(attempted_values) if attempted_values else None
        explanation = " ".join(filter(None, [source_card.get("what"), source_card.get("why"), source_card.get("details")]))
        real_card = card_base(
            card_id=metric_id,
            title=str(source_card.get("title") or metric_id),
            category=card_category,
            explanation=explanation or "Canonical metric from the corrected development real-validation source table.",
            direction=direction_value(source_card.get("direction")),
            unit=str(source_card.get("unit") or "source-defined unit"),
            source_population=str(source_card.get("protocol") or "Corrected DEVELOPMENT real-validation population; see per-method N and provenance."),
            n=n,
            acquisition_families=[],
            canonical_condition=str(source_card.get("section") or card_plane or "primary real-validation condition"),
            methods=method_records,
            provenance={
                "sourceFile": payload_info["path"], "sourceSha256": payload_info["sha256"],
                "summaryFile": summary_info["path"], "summarySha256": summary_info["sha256"],
                "evidenceFile": evidence_info["path"], "evidenceSha256": evidence_info["sha256"],
                "metricKey": source_card.get("metric_key"), "protocol": source_card.get("protocol"),
            },
            visual_case_ids=visual_case_ids if source_card.get("show_visual_evidence") else [],
            overlay_type=str(source_card.get("metric_key") or card_category),
        )
        add_category_card(categories, "real_validation", real_card)

    return payload, summary_rows, methods_by_id, {"payload": payload_info, "summary": summary_info, "evidence": evidence_info, "visualManifest": visual_manifest, "visualManifestInfo": visual_manifest_info}


RISK_COVERAGE_METHOD_IDS = (
    "classical_fixed", "segformer_b0", "segformer_b1", "segformer_b2",
    "meye_released", "pupil_dlc_gm", "dlc_zoo_mouse_pupil_vclose", "neuropupil_animal",
    "standard_dlc_matched", "meye_matched", "unet_small", "unet_base", "unet_b2_matched",
)


def add_risk_coverage_card(
    identity: dict[str, Any],
    categories: dict[str, list[dict[str, Any]]],
    evidence_rows: list[dict[str, str]],
    evidence_info: dict[str, Any],
    acquisition_family_ids: list[str],
    unet_source_info: dict[str, Any],
) -> dict[str, Any]:
    """Attach source-precomputed real-validation risk curves without recomputing points."""
    variant_by_method, family_map = get_identity_maps(identity)
    primary_evidence = {
        str(row.get("method_id")): row
        for row in evidence_rows
        if row.get("plane") == "shared_scalar_mask_gt" and row.get("method_id")
    }
    methods: list[dict[str, Any]] = []
    curve_records: dict[str, dict[str, Any]] = {}
    curve_provenance: list[dict[str, Any]] = []
    attempted: list[int] = []
    for method_id in RISK_COVERAGE_METHOD_IDS:
        evidence = primary_evidence.get(method_id, {})
        evidence_id = evidence.get("evidence_id") or None
        condition = evidence.get("condition") or None
        representation = evidence.get("representation") or None
        source_summary = {
            "evidenceFile": evidence_info["path"],
            "evidenceSha256": evidence_info["sha256"],
            "evidenceId": evidence_id,
            "condition": condition,
            "representation": representation,
            "plane": evidence.get("plane") or None,
            "frameMetricsSha256": evidence.get("frame_metrics_sha256") or None,
            "validationManifestSha256": evidence.get("validation_manifest_sha256") or None,
        }
        method = method_base(
            method_id, variant_by_method, family_map,
            representation=representation or ("native mask + common geometry" if method_id.startswith("unet") else None),
            operating_point=condition or "no canonical primary risk-coverage evidence",
            canonical=True,
        )
        curve_rows: list[dict[str, str]] = []
        curve_info: dict[str, Any] | None = None
        if evidence.get("frame_metrics_path"):
            frame_path = Path(str(evidence["frame_metrics_path"]))
            risk_path = frame_path.with_name("RISK_COVERAGE.csv")
            if risk_path.is_file():
                curve_rows, curve_info = read_external_csv_reference(
                    str(risk_path), "", "precomputed family-macro risk-coverage curve",
                )
        if curve_info:
            source_summary.update({"riskCoverageFile": curve_info["path"], "riskCoverageSha256": curve_info["sha256"]})
            curve_provenance.append({"methodId": method_id, "path": curve_info["path"], "sha256": curve_info["sha256"], "pointCount": len(curve_rows)})
        if curve_rows and len(curve_rows) > 3:
            points: list[dict[str, Any]] = []
            for row in curve_rows:
                threshold = as_number(row.get("threshold"))
                point = {
                    "threshold": threshold,
                    "coverage": as_number(row.get("coverage")),
                    "risk": as_number(row.get("group_macro_diameter_are")),
                    "retained": as_number(row.get("retained")),
                    "attempted": as_number(row.get("attempted")),
                }
                if threshold is None:
                    point["thresholdLabel"] = "No confidence cutoff"
                points.append(point)
            if any(point["coverage"] is None or point["risk"] is None for point in points):
                raise ValueError(f"Canonical risk-coverage curve for {method_id} contains a missing coverage/risk value.")
            point_attempted = [point["attempted"] for point in points if point["attempted"] is not None]
            if point_attempted:
                attempted.append(int(max(point_attempted)))
            method.update({
                "value": None, "unavailable": False, "status": "PRECOMPUTED_RISK_COVERAGE",
                "unavailableReason": None, "riskCoverage": points,
                "riskCoverageStatus": "AVAILABLE", "riskCoverageUnavailableReason": None,
                "riskCoverageMetric": "group_macro_diameter_are",
                "riskCoverageUnit": "unweighted acquisition-family macro diameter ARE fraction",
                "riskCoverageSourcePointCount": len(points),
                "riskCoverageFrameDecisionUnavailableReason": "Alternate-threshold frame decisions are not exported; this is a population-level precomputed curve.",
                "n": max(point_attempted) if point_attempted else as_number(evidence.get("attempted_rows")),
                "acceptedCount": as_number(evidence.get("retained_rows")),
                "totalCount": as_number(evidence.get("attempted_rows")),
                "checkpointHash": evidence.get("checkpoint_sha256") or None,
                "scoreManifestHash": evidence.get("validation_manifest_sha256") or None,
                "provenance": source_summary,
            })
        else:
            if curve_rows:
                reason = "Canonical source has only a three-point curve stub and marks native confidence as non-meaningful; no interpolated curve is exported."
                status = "NO_MEANINGFUL_NATIVE_CONFIDENCE"
            elif method_id.startswith("unet_"):
                reason = "The corrected U-Net comparison contains fixed-operating-point scores but no retained per-frame confidence curve source."
                status = "NO_CANONICAL_CONFIDENCE_CURVE"
                source_summary.update({"architectureComparisonFile": unet_source_info.get("path"), "architectureComparisonSha256": unet_source_info.get("sha256")})
            else:
                reason = "No source-provided canonical risk-coverage table is available for this primary method condition."
                status = "NO_CANONICAL_CONFIDENCE_CURVE"
            method.update({
                "value": None, "unavailable": True, "status": status,
                "unavailableReason": reason, "riskCoverage": None,
                "riskCoverageStatus": status, "riskCoverageUnavailableReason": reason,
                "riskCoverageMetric": "group_macro_diameter_are",
                "riskCoverageUnit": "unweighted acquisition-family macro diameter ARE fraction",
                "riskCoverageSourcePointCount": len(curve_rows) if curve_rows else 0,
                "riskCoverageFrameDecisionUnavailableReason": "Alternate-threshold frame decisions are not exported; only population-level evidence is available.",
                "n": as_number(evidence.get("attempted_rows")),
                "acceptedCount": as_number(evidence.get("retained_rows")),
                "totalCount": as_number(evidence.get("attempted_rows")),
                "checkpointHash": evidence.get("checkpoint_sha256") or None,
                "scoreManifestHash": evidence.get("validation_manifest_sha256") or None,
                "provenance": source_summary,
            })
        curve_records[method_id] = method
        methods.append(method)

    # Keep the source-provided curves alongside existing coverage/risk cards
    # where a method appears, without creating per-frame alternate-threshold
    # decisions from the selected visual examples.
    for category in ("coverage_risk", "real_validation"):
        for card in categories[category]:
            if card.get("category") != "coverage_risk" or card.get("overlayType") == "risk":
                continue
            for record in card.get("methods", []):
                curve = curve_records.get(str(record.get("methodId") or ""))
                if curve:
                    for field in (
                        "riskCoverage", "riskCoverageStatus", "riskCoverageUnavailableReason",
                        "riskCoverageMetric", "riskCoverageUnit", "riskCoverageSourcePointCount",
                    ):
                        record[field] = curve[field]
                    record.setdefault("provenance", {})["riskCoverageFile"] = (curve.get("provenance") or {}).get("riskCoverageFile")
                    record["riskCoverageFrameDecisionUnavailableReason"] = "Alternate-threshold frame decisions are not exported; this is a population-level precomputed curve."

    card = card_base(
        card_id="real-validation-risk-coverage",
        title="Risk–coverage operating curve",
        category="coverage_risk",
        explanation=(
            "Precomputed canonical threshold rows from corrected DEVELOPMENT real validation. Risk is the unweighted mean of per-acquisition-family mean diameter ARE (dimensionless fraction). "
            "The source-defined full-coverage endpoint is preserved as ‘No confidence cutoff’. The slider describes population curves only; alternate-threshold frame decisions are unavailable."
        ),
        direction="lower", unit="family-macro diameter ARE fraction",
        source_population="Corrected DEVELOPMENT real-validation population; methods share the source-declared primary scalar-mask/GT condition.",
        n=max(attempted) if attempted else None,
        acquisition_families=acquisition_family_ids,
        canonical_condition="per-method canonical primary condition; source-provided threshold curve, no browser-side recomputation",
        methods=methods,
        provenance={
            "evidenceFile": evidence_info["path"], "evidenceSha256": evidence_info["sha256"],
            "curveSources": curve_provenance,
            "riskMetric": "group_macro_diameter_are",
            "riskDefinition": "unweighted mean of per-acquisition-family mean retained-frame diameter ARE",
            "riskScale": "dimensionless fraction",
            "frameDecisionPolicy": "Unavailable at alternate thresholds; only population risk-coverage points are exported.",
        },
        visual_case_ids=[], overlay_type="risk",
        visual_evidence_unavailable_reason="This card contains population-level precomputed risk curves; synchronized alternate-threshold frame states are unavailable.",
    )
    add_category_card(categories, "coverage_risk", card)
    return {"card": card, "methods": curve_records, "curveSources": curve_provenance}


def parse_unet_comparison(
    identity: dict[str, Any],
    categories: dict[str, list[dict[str, Any]]],
    all_method_ids: set[str],
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    rows, source_info = read_csv(UNET_PATH, "corrected U-Net and SegFormer architecture comparison")
    variant_by_method, family_map = get_identity_maps(identity)
    method_family = {
        "unet_small": "vanilla_unet", "unet_base": "vanilla_unet",
        "unet_b2_matched": "vanilla_unet", "segformer_b2": "segformer",
    }
    method_names = {
        "unet_small": "U-Net small", "unet_base": "U-Net base",
        "unet_b2_matched": "U-Net B2-matched", "segformer_b2": "SegFormer B2",
    }
    for method_id in method_names:
        all_method_ids.add(method_id)
    # Field metadata describes the source metric, not its measured value.
    for field, title, unit, direction, category, explanation in UNET_METRIC_DEFS:
        observed = []
        for row in rows:
            method_id = row.get("method_id", "")
            if not method_id:
                continue
            value = as_number(row.get(field))
            source_n_field = field + "_n"
            n = as_number(row.get(source_n_field))
            low = as_number(row.get("family_bootstrap_ci95_low")) if field == "family_macro_diameter_are" else None
            high = as_number(row.get("family_bootstrap_ci95_high")) if field == "family_macro_diameter_are" else None
            if field == "family_macro_diameter_are" and method_id == "unet_b2_matched":
                low = as_number(row.get("paired_family_bootstrap_ci95_low"))
                high = as_number(row.get("paired_family_bootstrap_ci95_high"))
            if field == "family_macro_diameter_are" and method_id == "segformer_b2":
                low = as_number(row.get("family_bootstrap_ci95_low"))
                high = as_number(row.get("family_bootstrap_ci95_high"))
            if field == "coverage":
                n = as_number(row.get("attempted"))
            if field in ("retained_catastrophic_gt20_fraction",):
                n = as_number(row.get("retained"))
            family = method_family.get(method_id, "unknown")
            identity_id = method_id if method_id in variant_by_method else None
            style_method = identity_id or ("vanilla_unet_base" if method_id == "unet_base" else "vanilla_unet_small" if method_id == "unet_small" else None)
            style = variant_by_method.get(style_method or "", {})
            family_style = family_map.get(family, {})
            record = method_base(
                method_id, variant_by_method, family_map,
                method_name=method_names.get(method_id) or method_id,
                family_id=family,
                representation="native mask + common geometry",
                operating_point="frozen corrected validation operating point",
                canonical=True,
            )
            if style.get("color"):
                record["color"] = style["color"]
            if style.get("family_color") or family_style.get("color"):
                record["familyColor"] = style.get("family_color") or family_style.get("color")
            record.update(available_or_not(value, status="MEASURED" if value is not None else "NOT_MEASURED"))
            record["n"] = n
            record["acceptedCount"] = as_number(row.get("retained"))
            record["totalCount"] = as_number(row.get("attempted"))
            record["checkpointHash"] = row.get("selected_checkpoint_sha256") or None
            record["scoreManifestHash"] = row.get("protocol_payload_sha256") or None
            record["provenance"] = {
                "sourceFile": source_info["path"], "sourceSha256": source_info["sha256"],
                "validationCsvSha256": row.get("validation_csv_sha256"),
                "validationSplitSha256": row.get("validation_split_sha256"),
                "protocolPayloadSha256": row.get("protocol_payload_sha256"),
                "selectedEpoch": as_number(row.get("selected_epoch")),
                "trainableParameters": as_number(row.get("trainable_parameters")),
            }
            if low is not None:
                record["lower"] = low
            if high is not None:
                record["upper"] = high
            observed.append(record)
        if not observed:
            continue
        add_category_card(categories, category, card_base(
            card_id=f"unet-segformer-{field}", title=title, category=category,
            explanation=explanation,
            direction=direction, unit=unit,
            source_population="Corrected development validation; source N and acquisition-family identifiers are included in provenance.",
            n=max((m.get("totalCount") or 0 for m in observed), default=None),
            acquisition_families=[],
            canonical_condition="matched corrected validation; frozen selected checkpoint and confidence operating point",
            methods=observed,
            provenance={"sourceFile": source_info["path"], "sourceSha256": source_info["sha256"]},
            overlay_type=field,
        ))

    # Preserve the paired-family contrast and its source-reported interval as a
    # separate, directly auditable card; no interval is recomputed here.
    paired = []
    for row in rows:
        method_id = row.get("method_id", "")
        delta = as_number(row.get("paired_family_macro_delta_vs_segformer_b2"))
        if delta is None:
            continue
        family = method_family.get(method_id, "unknown")
        record = method_base(method_id, variant_by_method, family_map,
            method_name=method_names.get(method_id) or method_id,
            family_id=family, representation="native mask + common geometry",
            operating_point="paired seven-family bootstrap comparison against SegFormer B2", canonical=True)
        record.update(available_or_not(delta))
        record["n"] = as_number(row.get("family_count"))
        record["lower"] = as_number(row.get("paired_family_bootstrap_ci95_low"))
        record["upper"] = as_number(row.get("paired_family_bootstrap_ci95_high"))
        record["provenance"] = {"sourceFile": source_info["path"], "sourceSha256": source_info["sha256"], "interval": "source-reported paired family bootstrap CI95"}
        paired.append(record)
    if paired:
        add_category_card(categories, "geometry", card_base(
            card_id="unet-segformer-paired-family-diameter-delta",
            title="Paired family-macro diameter ARE difference vs SegFormer B2",
            category="geometry",
            explanation="Paired difference and 95% bootstrap interval are passed through from the corrected architecture-control table. Values crossing zero do not establish a broad architecture winner.",
            direction="target", unit="fraction difference",
            source_population=(
                f"Corrected validation set with {max((as_number(r.get('attempted')) or 0 for r in rows), default=0)} attempted frames "
                f"across {as_number(rows[0].get('family_count')) if rows else 'unknown'} acquisition families."
            ),
            n=as_number(rows[0].get("family_count")) if rows else None,
            canonical_condition="paired seven-family bootstrap comparison",
            methods=paired,
            provenance={"sourceFile": source_info["path"], "sourceSha256": source_info["sha256"]},
            overlay_type="paired_family_macro_delta_vs_segformer_b2",
        ))
    return rows, source_info


def exact_source_record(spec: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    data, summary_info = read_json(str(spec["path"]), "Exact-GT V2.1 spatial score summary")
    metric_tree = walk_path(data, spec["metric_path"]) if spec.get("metric_path") else data.get("metrics")
    if not isinstance(metric_tree, dict):
        metric_tree = {}
    score_info = None
    if spec.get("score_manifest"):
        score_path = ROOT / str(spec["score_manifest"])
        if score_path.is_file():
            score, score_info = read_json(str(spec["score_manifest"]), "Exact-GT score manifest and hash chain")
        else:
            score = {}
    else:
        score = {}
    if spec.get("metric_path") and spec["metric_path"] == ["spatial"]:
        metric_tree = data.get("spatial", {})
    total = data.get("total", {})
    if spec.get("metric_path") == ["total", "mean_on_accepted"]:
        metric_tree = walk_path(data, ["total", "mean_on_accepted"]) or {}
    elif spec.get("metric_path") == ["spatial"]:
        total = data.get("spatial", {})
    valid = as_number(data.get("valid"))
    attempted = as_number(data.get("attempted"))
    coverage = as_number(data.get("coverage"))
    if isinstance(total, dict):
        valid = valid if valid is not None else as_number(total.get("valid"))
        attempted = attempted if attempted is not None else as_number(total.get("attempted") if total.get("attempted") is not None else total.get("cases"))
        coverage = coverage if coverage is not None else as_number(total.get("coverage"))
    qualification = data.get("representation_qualification")
    if not qualification and spec["method_id"] in {"else", "excuse", "pure", "purest", "starburst", "swirski2d"}:
        qualification = "Native ellipse output; no pupil segmentation mask is produced by this method."
    return {
        **spec,
        "data": data,
        "metricTree": metric_tree,
        "valid": valid,
        "attempted": attempted,
        "coverage": coverage,
        "status": data.get("status") or score.get("status") or "MEASURED",
        "qualification": qualification,
        "checkpointHash": walk_path(data, ["provenance", "checkpoint_sha256"]) or data.get("checkpoint_sha256"),
        "scoreManifestHash": score_info["sha256"] if score_info else None,
    }, summary_info, score_info


def parse_exact_gt(
    identity: dict[str, Any], categories: dict[str, list[dict[str, Any]]], all_method_ids: set[str]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    variant_by_method, family_map = get_identity_maps(identity)
    sources = []
    source_refs = []
    for spec in EXACT_GT_SOURCES:
        record, summary_info, score_info = exact_source_record(spec)
        data = record["data"]
    # The new closure summaries are spatial-only. The older fixed/classical
    # baselines expose the spatial subgroup explicitly.
        spatial = data.get("spatial") if spec["metric_path"] == ["spatial"] else None
        if spec["method_id"] in {"classical_fixed", "else", "excuse", "pure", "purest", "starburst", "swirski2d"}:
            if not isinstance(spatial, dict) or as_number(spatial.get("attempted")) is None:
                raise ValueError(f"Exact-GT spatial subgroup is not separately summarized: {spec['path']}")
        elif record["attempted"] is None:
            raise ValueError(f"Exact-GT spatial summary does not report its attempted population: {spec['path']}")
        sources.append(record)
        source_refs.append({
            "methodId": spec["method_id"],
            "summaryFile": summary_info["path"], "summarySha256": summary_info["sha256"],
            "scoreManifestFile": score_info["path"] if score_info else None,
            "scoreManifestSha256": score_info["sha256"] if score_info else None,
            "status": record["status"],
            "representationQualification": record["qualification"],
        })
        all_method_ids.add(spec["method_id"])

    population_sizes = [as_number(source["attempted"]) for source in sources if as_number(source["attempted"]) is not None]
    if not population_sizes or len(set(population_sizes)) != 1:
        raise ValueError("Exact-GT spatial summaries do not share one explicitly reported attempted population.")
    population_n = population_sizes[0]
    exact_case_ids: list[str] = []
    exact_media_rel = "benchmark_site/media_export/exact_gt_visual_manifest.json"
    for candidate in [
        "benchmark_site/media_export/exact_gt_selected_cases_20260924_v1.json",
        exact_media_rel,
        "benchmark_site/media_export/website_exact_gt_visual_manifest.json",
        "benchmark_site/media_export/exact_gt/website_exact_gt_visual_manifest.json",
        f"{EXP}/website_exact_gt_visual_manifest.json",
    ]:
        if (ROOT / candidate).is_file():
            exact_media, media_info = read_json(candidate, "bounded Exact-GT visual severity media manifest")
            exact_case_ids = [str(c.get("id")) for c in exact_media.get("cases", []) if c.get("id")]
            break
    else:
        exact_media = None
        media_info = None

    frame_rows_by_method: dict[str, dict[str, dict[str, str]]] = {}
    frame_metric_sources: dict[str, dict[str, Any]] = {}
    for method_id, relative in EXACT_GT_FRAME_METRIC_PATHS.items():
        rows, info = read_csv(relative, "selected Exact-GT V2.1 per-frame native geometry and score rows")
        keyed: dict[str, dict[str, str]] = {}
        for row in rows:
            execution_id = str(row.get("execution_id") or row.get("sample_id") or "")
            if execution_id:
                if execution_id in keyed:
                    raise ValueError(f"Duplicate Exact-GT execution ID in {relative}: {execution_id}")
                keyed[execution_id] = row
        frame_rows_by_method[method_id] = keyed
        frame_metric_sources[method_id] = info

    metric_names = list(METRIC_DEFS)
    for metric_name in metric_names:
        title, unit, direction, category = METRIC_DEFS[metric_name]
        for statistic in ("mean", "median", "p95"):
            method_records = []
            for source in sources:
                method_id = source["method_id"]
                tree = source["metricTree"]
                stat_value = None
                if metric_name == "coverage":
                    stat_value = source["coverage"] if statistic == "mean" else None
                elif isinstance(tree, dict):
                    value_block = tree.get(metric_name)
                    if isinstance(value_block, dict):
                        stat_value = as_number(value_block.get(statistic))
                    elif statistic == "mean":
                        stat_value = as_number(value_block)
                method = method_base(
                    method_id, variant_by_method, family_map,
                    method_name=None, family_id=None, representation=source.get("representation"),
                    operating_point="Exact-GT V2.1 spatial; native frozen output",
                    canonical=True,
                )
                unavailable_reason = None
                if stat_value is None:
                    if metric_name in {"dice", "iou", "assd_px", "hd95_px"} and source.get("qualification"):
                        unavailable_reason = str(source["qualification"])
                    else:
                        unavailable_reason = "This statistic is not present in the canonical method summary."
                method.update(available_or_not(stat_value, status="MEASURED" if stat_value is not None else "NOT_MEASURED", reason=unavailable_reason))
                method.update({
                    "n": source["valid"],
                    "acceptedCount": source["valid"],
                    "totalCount": source["attempted"] or population_n,
                    "checkpointHash": source.get("checkpointHash"),
                    "scoreManifestHash": source.get("scoreManifestHash"),
                    "representation": source.get("representation"),
                    "provenance": {
                        "summaryFile": source["path"],
                        "scoreManifestFile": source.get("score_manifest"),
                        "summaryStatus": source["status"],
                        "representationQualification": source.get("qualification"),
                    },
                    "visualCaseIds": exact_case_ids,
                })
                method_records.append(method)
            if any(m.get("value") is not None for m in method_records):
                add_category_card(categories, "exact_gt", card_base(
                    card_id=f"exact-gt-{metric_name}-{statistic}",
                    title=f"{title} · {statistic}",
                    category="exact_gt",
                    explanation=f"{statistic.capitalize()} source-reported value on accepted Exact-GT V2.1 spatial predictions; coverage and per-method valid N are separate.",
                    direction=direction, unit=unit,
                    source_population=f"Exact-GT V2.1 spatial corpus ({population_n} cases); each method’s accepted N is shown separately.",
                    n=population_n,
                    canonical_condition="native output scored under the frozen V2.1 spatial protocol; geometry-only methods remain geometry-only",
                    methods=method_records,
                    provenance={"sourceSummaries": source_refs, "statistic": statistic},
                    visual_case_ids=exact_case_ids,
                    overlay_type=metric_name,
                ))

    # Coverage and accepted count are direct fields in the canonical summaries.
    for field, title, unit, direction in [
        ("coverage", "Exact-GT accepted-frame coverage", "fraction", "higher"),
        ("valid", "Exact-GT accepted cases", "cases", "higher"),
    ]:
        records = []
        for source in sources:
            value = source["coverage"] if field == "coverage" else source["valid"]
            method = method_base(source["method_id"], variant_by_method, family_map,
                representation=source.get("representation"), operating_point="Exact-GT V2.1 spatial", canonical=True)
            method.update(available_or_not(value, status="MEASURED" if value is not None else "NOT_MEASURED"))
            method.update({"n": source["valid"], "acceptedCount": source["valid"], "totalCount": source["attempted"] or population_n,
                "scoreManifestHash": source.get("scoreManifestHash"),
                "provenance": {"summaryFile": source["path"], "status": source["status"]},
                "visualCaseIds": exact_case_ids})
            records.append(method)
        add_category_card(categories, "exact_gt", card_base(
            card_id=f"exact-gt-{field}", title=title, category="exact_gt",
            explanation="Direct summary field from the frozen V2.1 spatial scorer; no method-specific missing output is filled or interpolated.",
            direction=direction, unit=unit,
            source_population=f"Exact-GT V2.1 spatial corpus ({population_n} cases).",
            n=population_n, canonical_condition="native output at frozen operating point",
            methods=records, provenance={"sourceSummaries": source_refs}, visual_case_ids=exact_case_ids,
            overlay_type="coverage" if field == "coverage" else "valid",
        ))
    return sources, {
        "sources": source_refs,
        "visualManifest": media_info,
        "visualCases": exact_media,
        "frameMetricSources": frame_metric_sources,
        "frameRowsByMethod": frame_rows_by_method,
    }


def parse_temporal(
    identity: dict[str, Any], categories: dict[str, list[dict[str, Any]]], all_method_ids: set[str]
) -> tuple[dict[str, Any], dict[str, Any]]:
    variant_by_method, family_map = get_identity_maps(identity)
    temporal_data: dict[str, Any] = {"schemaVersion": SCHEMA_VERSION, "summaries": [], "perSeedObservations": [], "threeHzSeedMetrics": {}}
    source_info: dict[str, Any] = {"metricFiles": []}
    id_map = {
        "mouse-pupil-analysis-v0.2.0": "mouse_pupil_analysis_v020",
        "B0": "segformer_b0", "B1": "segformer_b1", "B2": "segformer_b2",
        "small": "unet_small", "base": "unet_base", "b2_matched": "unet_b2_matched",
        "meye_released": "meye_released", "standard_dlc_matched": "standard_dlc_matched",
        "meye_matched": "meye_matched", "pupil_dlc_gm": "pupil_dlc_gm",
    }
    summary_by_method: dict[str, dict[str, Any]] = {}
    summary_input_by_method: dict[str, dict[str, Any]] = {}
    for relative in TEMPORAL_METRIC_PATHS:
        d, info = read_json(relative, "Exact-GT V2.2 temporal metric summaries")
        model_source = str(d.get("model_id") or d.get("modelId") or "")
        method_id = id_map.get(model_source, model_source)
        if not method_id:
            continue
        all_method_ids.add(method_id)
        summary_by_method[method_id] = d
        summary_input_by_method[method_id] = info
        source_info["metricFiles"].append(info)
        temporal_data["summaries"].append({
            "methodId": method_id,
            "sourceModelId": model_source,
            "status": d.get("status"),
            "seedCount": as_number(d.get("seed_count")),
            "sequenceCount": as_number(d.get("sequence_count")),
            "overallFramePooled": d.get("overall_frame_pooled", {}),
            "pooledSequenceDistribution": d.get("pooled_sequence_distribution", {}),
            "seedSummary": d.get("seed_summary", {}),
            "seedFramePooled": d.get("seed_frame_pooled", {}),
            "policy": d.get("policy"),
            "executionFreezeSha256": d.get("execution_freeze_sha256"),
            "nativeManifestSha256": d.get("native_manifest_sha256"),
            "truthSha256": d.get("truth_sha256"),
            "sourceFile": info["path"], "sourceSha256": info["sha256"],
        })

    seed_rows, seed_info = read_csv(TEMPORAL_SEED_PATH, "raw seven-seed temporal observations")
    seed_manifest, seed_manifest_info = read_json(TEMPORAL_SEED_MANIFEST_PATH, "temporal observation score hashes and frozen interim status")
    source_info.update({"perSeed": seed_info, "perSeedManifest": seed_manifest_info})
    seed_by_method: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in seed_rows:
        source_id = str(row.get("method_id", ""))
        method_id = id_map.get(source_id, source_id)
        observation = {
            "methodId": method_id,
            "sourceMethodId": source_id,
            "seedId": row.get("seed_id"),
            "centerRmsePx": as_number(row.get("center_rmse_px")),
            "diameterRmsePx": as_number(row.get("diameter_rmse_px")),
            "meanSequenceCoverage": as_number(row.get("mean_sequence_coverage")),
            "sine3HzGain": as_number(row.get("sine_3hz_gain")),
            "sine3HzPhaseLagSec": as_number(row.get("sine_3hz_phase_lag_sec")),
            "falseStaticDiameterJitterPx": as_number(row.get("false_static_diameter_jitter_px")),
            "scoreSha256": row.get("score_sha256"),
        }
        temporal_data["perSeedObservations"].append(observation)
        seed_by_method[method_id].append(observation)
        all_method_ids.add(method_id)

    temporal_data["interimManifest"] = {
        "status": seed_manifest.get("status"),
        "schema": seed_manifest.get("schema"),
        "metricProtocolSha256": seed_manifest.get("metric_protocol_sha256"),
        "perSeedCsvSha256": seed_manifest.get("per_seed_csv_sha256"),
        "methodIds": seed_manifest.get("method_ids", []),
        "allenModelScoring": seed_manifest.get("allen_model_scoring"),
        "legacyProtectedInferenceQueries": seed_manifest.get("legacy_protected_inference_queries"),
    }

    # Cards use only source-reported values from TEMPORAL_METRICS.json. When a
    # source metric has only per-seed values (e.g. 3-Hz gain/phase), the exact
    # observations are attached without selecting a pooled central estimate.
    for metric_key, definition in TEMPORAL_METRIC_DEFS.items():
        title, unit, direction, category = definition
        for statistic in ("mean", "median"):
            methods = []
            has_any = False
            for method_id, d in summary_by_method.items():
                stat_block = d.get("pooled_sequence_distribution", {}).get(metric_key)
                value = as_number(stat_block.get(statistic)) if isinstance(stat_block, dict) else None
                n = as_number(stat_block.get("n")) if isinstance(stat_block, dict) else None
                record = method_base(method_id, variant_by_method, family_map,
                    representation="source-native output scored against Exact-GT V2.2 temporal truth",
                    operating_point="frozen temporal execution and scoring policy", canonical=True)
                record.update(available_or_not(value,
                    status="MEASURED" if value is not None else "NOT_MEASURED",
                    reason="This source has no valid observations for this sequence-level statistic." if value is None else None))
                record["n"] = n
                record["perSeed"] = []
                record["scoreManifestHash"] = d.get("native_manifest_sha256")
                record["provenance"] = {
                    "sourceFile": summary_input_by_method[method_id]["path"],
                    "sourceSha256": summary_input_by_method[method_id]["sha256"],
                    "summaryStatistic": statistic,
                    "summaryN": n,
                    "temporalPolicy": d.get("policy"),
                }
                if value is not None:
                    has_any = True
                methods.append(record)
            # Emit only if at least one canonical summary reports this statistic.
            if has_any:
                add_category_card(categories, category, card_base(
                    card_id=f"temporal-{metric_key}-{statistic}", title=f"{title} · {statistic}", category=category,
                    explanation="Direct statistic over source-reported sequence summaries. Method-specific valid sequence count is shown; missing values remain unavailable. Temporal fidelity is not ranked by RMSE alone.",
                    direction=direction, unit=unit,
            source_population=(
                f"Exact-GT V2.2 multi-seed temporal corpus; "
                f"{as_number(next(iter(summary_by_method.values())).get('seed_count')) if summary_by_method else 'unknown'} "
                "model-blind seeds and source-defined trajectories."
            ),
                    n=None, canonical_condition="frozen framewise outputs; no interpolation; method-specific valid sequences",
                    methods=methods,
                    provenance={"summarySources": [{"methodId": mid, "path": summary_input_by_method[mid]["path"], "sha256": summary_input_by_method[mid]["sha256"]} for mid in summary_by_method]},
                    overlay_type=metric_key,
                ))

    for metric_key, title, unit, direction, field in [
        ("sine3HzGain", "3-Hz diameter gain", "ratio", "target", "sine3HzGain"),
        ("sine3HzPhaseLagSec", "3-Hz diameter phase lag", "seconds", "target", "sine3HzPhaseLagSec"),
    ]:
        methods = []
        for method_id in sorted(set(seed_by_method) | set(summary_by_method)):
            observations = seed_by_method.get(method_id, [])
            record = method_base(method_id, variant_by_method, family_map,
                representation="source-native output; 3-Hz sinusoidal temporal test",
                operating_point="per-seed canonical observations; no pooled estimate selected", canonical=True)
            record.update({
                "value": None,
                "unavailable": True,
                "status": "PER_SEED_OBSERVATIONS_ONLY",
                "unavailableReason": "Canonical source provides per-seed values; no central estimate is supplied here.",
                "n": len(observations),
                "perSeed": [{"seedId": obs["seedId"], "value": obs.get(field), "unit": unit, "status": "MEASURED" if obs.get(field) is not None else "NOT_MEASURED"} for obs in observations],
                "scoreManifestHash": None,
                "provenance": {"sourceFile": seed_info["path"], "sourceSha256": seed_info["sha256"], "sourceManifest": seed_manifest_info["path"], "sourceManifestSha256": seed_manifest_info["sha256"]},
            })
            methods.append(record)
        add_category_card(categories, "temporal", card_base(
            card_id=f"temporal-{metric_key}", title=title, category="temporal",
            explanation="Per-seed observations are shown without a cross-seed average. Gain near one and lag near zero are fidelity targets; RMSE alone is not sufficient.",
            direction=direction, unit=unit,
            source_population=(
                f"Exact-GT V2.2 temporal comparison; "
                f"{as_number(next(iter(summary_by_method.values())).get('seed_count')) if summary_by_method else 'unknown'} "
                "seeds in the raw source PER_SEED.csv observations."
            ),
            n=as_number(summary_by_method[next(iter(summary_by_method))].get("seed_count")) if summary_by_method else None,
            canonical_condition="per-seed measurements; no aggregation in exporter",
            methods=methods,
            provenance={"perSeedCsv": seed_info["path"], "perSeedCsvSha256": seed_info["sha256"], "interimManifest": seed_manifest_info["path"], "interimManifestSha256": seed_manifest_info["sha256"]},
            overlay_type=metric_key,
        ))
    temporal_data["threeHzSeedMetrics"] = {
        "gain": {"metric": "sine_3hz_gain", "unit": "ratio", "target": 1, "observations": [r for r in temporal_data["perSeedObservations"]]},
        "phaseLag": {"metric": "sine_3hz_phase_lag_sec", "unit": "seconds", "target": 0, "observations": [r for r in temporal_data["perSeedObservations"]]},
        "aggregation": "none; raw per-seed observations only",
    }
    temporal_data["sourcePopulation"] = {
        "status": seed_manifest.get("status"),
        "seedCount": as_number(next(iter(summary_by_method.values())).get("seed_count")) if summary_by_method else None,
        "methodCount": len(summary_by_method),
        "truthRows": None,
        "note": "Frame-pooled and sequence-summary values are method-specific; pupil_dlc_gm has sparse valid sequences, and no interpolation is applied.",
    }
    return temporal_data, source_info


def parse_runtime(
    identity: dict[str, Any], categories: dict[str, list[dict[str, Any]]], all_method_ids: set[str]
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    rows, csv_info = read_csv(RUNTIME_CSV_PATH, "verified common A5000 runtime tournament values")
    completion, completion_info = read_json(RUNTIME_COMPLETION_PATH, "common A5000 protocol, scope, and qualified exclusions")
    variant_by_method, family_map = get_identity_maps(identity)
    exclusion_by_id: dict[str, dict[str, Any]] = {}
    for item in completion.get("excluded_or_qualified", []):
        raw_id = str(item.get("method", ""))
        normalized = raw_id.strip()
        exclusion_by_id[normalized] = item
    field_definitions = [
        ("end_to_end_p50_ms", "Common runtime end-to-end p50", "ms", "lower"),
        ("end_to_end_p95_ms", "Common runtime end-to-end p95", "ms", "lower"),
        ("end_to_end_p99_ms", "Common runtime end-to-end p99", "ms", "lower"),
        ("fps_at_median_p50", "Common runtime FPS at median p50", "frames/s", "higher"),
        ("peak_vram_mib", "Common runtime peak GPU VRAM", "MiB", "lower"),
        ("peak_process_ram_mib", "Common runtime peak process RAM", "MiB", "lower"),
        ("model_size_bytes", "Common runtime model size", "bytes", "lower"),
        ("parameter_count_if_defined", "Common runtime parameter count", "parameters", "descriptive"),
        ("load_init_ms", "Common runtime load and initialization time", "ms", "lower"),
    ]
    method_ids = {str(row.get("model_id", "")) for row in rows if row.get("model_id")}
    method_ids.update(exclusion_by_id)
    for method_id in method_ids:
        all_method_ids.add(method_id)
    for field, title, unit, direction in field_definitions:
        records = []
        for method_id in sorted(method_ids):
            row = next((r for r in rows if r.get("model_id") == method_id), None)
            exclusion = exclusion_by_id.get(method_id)
            record = method_base(method_id, variant_by_method, family_map,
                operating_point="common A5000 batch-one protocol", canonical=method_id in {str(r.get("model_id")) for r in rows})
            if row:
                value = as_number(row.get(field))
                record.update(available_or_not(value, status="COMMON_BATCH1_VALID" if value is not None else "NOT_MEASURED"))
                record.update({
                    "n": None,
                    "backend": "CUDA A5000 common runner",
                    "precision": row.get("precision"),
                    "runtimeProtocol": completion.get("protocol_sha256"),
                    "scoreManifestHash": row.get("manifest_sha256"),
                    "provenance": {
                        "sourceFile": csv_info["path"], "sourceSha256": csv_info["sha256"],
                        "timedCallsSha256": row.get("timed_calls_sha256"),
                        "independentReplaySha256": row.get("independent_replay_sha256"),
                        "latencyRank": as_number(row.get("latency_p50_rank_among_verified")),
                    },
                })
            else:
                status = str(exclusion.get("status") if exclusion else "NOT_MEASURED")
                reason = status.replace("_", " ").lower()
                record.update(available_or_not(None, status=status, reason=reason))
                record.update({
                    "runtimeProtocol": completion.get("protocol_sha256"),
                    "provenance": {
                        "completionFile": completion_info["path"], "completionSha256": completion_info["sha256"],
                        "evidenceSha256": exclusion.get("evidence_sha256") if exclusion else None,
                    },
                })
            records.append(record)
        add_category_card(categories, "runtime", card_base(
            card_id=f"runtime-common-{field}", title=title, category="runtime",
            explanation="Measured under the hash-bound common A5000 batch-one tournament. This is a runtime-only verified subset; qualified or withheld methods stay explicit.",
            direction=direction, unit=unit,
            source_population=f"Common A5000 tournament; {completion.get('source_count')} sources and {completion.get('acquisition_family_count')} acquisition families; batch size {completion.get('batch_size')}.",
            n=as_number(completion.get("verified_total_timed_calls")),
            canonical_condition="COMMON_BATCH1_VALID only; native-only and parity-withheld workflows retain unavailable records",
            methods=records,
            provenance={"tournamentCsv": csv_info["path"], "tournamentCsvSha256": csv_info["sha256"], "completionJson": completion_info["path"], "completionJsonSha256": completion_info["sha256"], "protocolSha256": completion.get("protocol_sha256"), "verifiedMethodCount": completion.get("verified_method_count"), "verifiedTotalTimedCalls": completion.get("verified_total_timed_calls")},
            runtime_protocol=str(completion.get("protocol_sha256") or ""),
            overlay_type=field,
            visual_evidence_unavailable_reason="The runtime tournament contains timing, memory, and replay records but no synchronized image or prediction media.",
        ))
    return rows, {"completion": completion, "csvInfo": csv_info, "completionInfo": completion_info}


def build_deployment_rows(
    identity: dict[str, Any], categories: dict[str, list[dict[str, Any]]], all_method_ids: set[str]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw_rows, source_info = read_csv(DEPLOY, "corrected SegFormer 30-condition deployment matrix")
    parity_rows, parity_info = read_csv(DEPLOY_PARITY, "same-checkpoint corrected deployment output fidelity")
    variant_by_method, family_map = get_identity_maps(identity)
    int8_results: dict[str, dict[str, Any]] = {}
    int8_info: dict[str, dict[str, Any]] = {}
    for model in ("B0", "B1", "B2"):
        relative = f"{INT8_DIR}/{model}_RESULT.json"
        d, info = read_json(relative, "executed INT8 deployment extension results")
        int8_results[model] = d
        int8_info[model] = info

    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        model = str(raw.get("model", ""))
        runtime_id = str(raw.get("runtime", ""))
        matrix_backend = raw.get("backend")
        matrix_precision = raw.get("precision")
        row: dict[str, Any] = {k: (as_number(v) if v != "" and v is not None and k not in {"model", "runtime", "condition", "status", "attempt_disposition", "backend", "precision", "quantization", "checkpoint_sha256", "result_sha256"} else (v or None)) for k, v in raw.items()}
        row["model"] = model
        row["runtime"] = runtime_id
        row["sourceFile"] = source_info["path"]
        row["sourceSha256"] = source_info["sha256"]
        row["int8Extension"] = False
        row["comparisonCohort"] = "corrected-1337"
        if runtime_id == "tensorrt_int8":
            extension = int8_results[model]
            extension_info = int8_info[model]
            scientific = extension.get("scientific", {})
            pure = extension.get("pure_inference_cuda", {})
            total = extension.get("end_to_end", {}).get("total", {})
            mem = extension.get("memory", {})
            size = extension.get("size", {})
            prov = extension.get("provenance", {})
            row.update({
                "condition": "frozen_selected_checkpoint_cutoff",
                "status": "FAIL COVERAGE" if str(scientific.get("primary_endpoint_status", "")).startswith("FAIL") else str(scientific.get("primary_endpoint_status") or extension.get("status")),
                "attempt_disposition": "EXECUTED; primary endpoint status preserved from INT8 extension",
                "backend": extension.get("backend"),
                "precision": extension.get("precision"),
                "quantization": extension.get("quantization"),
                "frozen_confidence_cutoff": as_number(scientific.get("threshold")),
                "coverage": as_number(scientific.get("coverage")),
                "acquisition_family_macro_diameter_ARE": as_number(scientific.get("group_macro_pupil_diameter_are")),
                "acquisition_family_macro_center_error_px": as_number(scientific.get("group_macro_centroid_error_px")),
                "acquisition_family_macro_area_ARE": as_number(scientific.get("group_macro_area_are")),
                "acquisition_family_macro_major_ARE": as_number(scientific.get("group_macro_major_axis_are")),
                "acquisition_family_macro_minor_ARE": as_number(scientific.get("group_macro_minor_axis_are")),
                "pure_model_latency_p50_ms": as_number(pure.get("p50_ms")),
                "pure_model_latency_p95_ms": as_number(pure.get("p95_ms")),
                "pure_model_FPS_from_mean": as_number(pure.get("fps_from_mean")),
                "end_to_end_latency_p50_ms": as_number(total.get("p50_ms")),
                "end_to_end_latency_p95_ms": as_number(total.get("p95_ms")),
                "end_to_end_latency_p99_ms": as_number(total.get("p99_ms")),
                "end_to_end_FPS_from_mean": as_number(total.get("fps_from_mean")),
                "peak_PyTorch_allocated_VRAM_bytes": as_number(mem.get("peak_allocated_bytes")),
                "persistent_engine_bytes": as_number(size.get("persistent_engine_bytes")),
                "training_checkpoint_bytes": as_number(size.get("training_checkpoint_bytes")),
                "parameter_count": as_number(size.get("parameters")),
                "validation_frames": as_number(prov.get("validation_rows")),
                "checkpoint_sha256": prov.get("checkpoint_sha256"),
                "result_sha256": extension_info["sha256"],
                "sourceFile": extension_info["path"],
                "sourceSha256": extension_info["sha256"],
                "int8Extension": True,
                "comparisonCohort": "legacy-int8-1130",
                "scientificStatus": scientific.get("primary_endpoint_status"),
                "runtimeSourceStatus": extension.get("status"),
                "provenance": {
                    "sourceFile": extension_info["path"], "sourceSha256": extension_info["sha256"],
                    "checkpointSha256": prov.get("checkpoint_sha256"),
                    "validationManifestSha256": prov.get("validation_manifest_sha256"),
                    "implementationSha256": prov.get("implementation_sha256"),
                    "deploymentExtraSha256": prov.get("deployment_extra_sha256"),
                    "timedIterations": extension.get("timed_iterations"),
                    "batchSize": extension.get("batch_size"),
                },
            })
        else:
            row["checkpoint_sha256"] = raw.get("checkpoint_sha256") or None
            row["result_sha256"] = raw.get("result_sha256") or None
            row["provenance"] = {"sourceFile": source_info["path"], "sourceSha256": source_info["sha256"], "resultSha256": raw.get("result_sha256") or None}
        backend_source = str(row.get("backend") or matrix_backend or "")
        precision_source = str(row.get("precision") or matrix_precision or "")
        backend_lower = backend_source.lower()
        if "tensorrt" in backend_lower:
            backend_label = "TensorRT"
        elif "inductor" in backend_lower or "torch.compile" in backend_lower:
            backend_label = "Inductor"
        elif "pytorch" in backend_lower:
            backend_label = "PyTorch"
        else:
            backend_label = backend_source or None
        precision_lower = precision_source.lower()
        if "int8" in precision_lower:
            precision_label = "INT8"
        elif "bfloat16" in precision_lower or "bf16" in precision_lower:
            precision_label = "BF16"
        elif "float16" in precision_lower or "fp16" in precision_lower:
            precision_label = "FP16"
        elif "float32" in precision_lower or "fp32" in precision_lower:
            precision_label = "FP32"
        else:
            precision_label = precision_source or None
        row["backendRaw"] = backend_source or None
        row["precisionRaw"] = precision_source or None
        row["deploymentMatrixBackendRaw"] = matrix_backend or None
        row["deploymentMatrixPrecisionRaw"] = matrix_precision or None
        row["backend"] = backend_label
        row["precision"] = precision_label
        row["provenance"] = {
            **(row.get("provenance") or {}),
            "backendRaw": backend_source or None,
            "precisionRaw": precision_source or None,
            "deploymentMatrixBackendRaw": matrix_backend or None,
            "deploymentMatrixPrecisionRaw": matrix_precision or None,
        }
        rows.append(row)

    field_definitions = [
        ("pure_model_latency_p50_ms", "Deployment model-only latency p50", "ms", "lower"),
        ("end_to_end_latency_p50_ms", "Deployment end-to-end latency p50", "ms", "lower"),
        ("end_to_end_latency_p95_ms", "Deployment end-to-end latency p95", "ms", "lower"),
        ("end_to_end_latency_p99_ms", "Deployment end-to-end latency p99", "ms", "lower"),
        ("pure_model_FPS_from_mean", "Deployment model-only throughput", "frames/s", "higher"),
        ("end_to_end_FPS_from_mean", "Deployment end-to-end throughput", "frames/s", "higher"),
        ("coverage", "Deployment validation coverage", "fraction", "higher"),
        ("acquisition_family_macro_diameter_ARE", "Deployment family-macro diameter ARE", "fraction", "lower"),
        ("acquisition_family_macro_center_error_px", "Deployment family-macro center error", "px", "lower"),
        ("acquisition_family_macro_area_ARE", "Deployment family-macro area ARE", "fraction", "lower"),
        ("acquisition_family_macro_major_ARE", "Deployment family-macro major-axis ARE", "fraction", "lower"),
        ("acquisition_family_macro_minor_ARE", "Deployment family-macro minor-axis ARE", "fraction", "lower"),
        ("peak_PyTorch_allocated_VRAM_bytes", "Deployment peak allocated VRAM", "bytes", "lower"),
        ("persistent_engine_bytes", "Deployment persistent engine size", "bytes", "lower"),
        ("training_checkpoint_bytes", "Deployment training checkpoint size", "bytes", "lower"),
        ("parameter_count", "Deployment model parameter count", "parameters", "descriptive"),
    ]
    for raw in rows:
        model = str(raw["model"]).lower()
        base_method_id = f"segformer_{model}"
        all_method_ids.add(base_method_id)
        condition_id = f"{base_method_id}__{raw['runtime']}"
        raw["methodId"] = condition_id
        raw["baseMethodId"] = base_method_id
        raw["architecture"] = raw["model"]
        raw["methodName"] = f"SegFormer {raw['model']} · {raw.get('backend') or raw['runtime']} · {raw.get('precision') or 'not run'}"
        raw["family"] = "segformer"
        raw["familyId"] = "segformer"
        raw["representation"] = variant_by_method.get(base_method_id, {}).get("representation") or "native mask + common geometry"
        raw["operatingPoint"] = raw.get("condition")
        raw["colorKey"] = base_method_id
        raw["color"] = variant_by_method.get(base_method_id, {}).get("color") or family_map.get("segformer", {}).get("color")
        raw["familyColor"] = variant_by_method.get(base_method_id, {}).get("family_color") or family_map.get("segformer", {}).get("color")
        raw["canonical"] = raw["runtime"] == "pytorch_fp32"
        raw["isCanonical"] = raw["canonical"]
        raw["checkpointHash"] = raw.get("checkpoint_sha256")
        raw["scoreManifestHash"] = raw.get("result_sha256")
        raw["backend"] = raw.get("backend")
        raw["precision"] = raw.get("precision")
        raw["quantization"] = raw.get("quantization")
        raw["runtimeProtocol"] = raw.get("sourceSha256")
        raw["n"] = as_number(raw.get("validation_frames"))
        raw["visualCaseIds"] = []

    for field, title, unit, direction in field_definitions:
        records = []
        for row in rows:
            method = {
                k: row.get(k) for k in [
                    "methodId", "methodName", "family", "familyId", "architecture", "representation",
                    "operatingPoint", "backend", "precision", "backendRaw", "precisionRaw",
                    "deploymentMatrixBackendRaw", "deploymentMatrixPrecisionRaw", "quantization", "colorKey", "color",
                    "familyColor", "canonical", "isCanonical", "checkpointHash", "scoreManifestHash",
                    "runtimeProtocol", "n", "provenance", "comparisonCohort", "int8Extension",
                ] if k in row
            }
            value = as_number(row.get(field))
            status = str(row.get("status") or "NOT_MEASURED")
            reason = None
            if value is None:
                reason = "Condition was not executed or the canonical source contains no measurement."
            method.update(available_or_not(value, status=status, reason=reason))
            method["provenance"] = {
                **(row.get("provenance") or {}),
                "quantization": row.get("quantization"),
                "attemptDisposition": row.get("attempt_disposition"),
                "scientificStatus": row.get("scientificStatus"),
                "runtimeSourceStatus": row.get("runtimeSourceStatus"),
            }
            records.append(method)
        add_category_card(categories, "deployment", card_base(
            card_id=f"deployment-{field}", title=title, category="deployment",
            explanation="All thirty executed B0/B1/B2 conditions remain accessible. The 27 corrected 1,337-frame conditions and three executed legacy 1,130-frame INT8 extensions use different checkpoints and validation populations; their accuracy and coverage are not directly comparable.",
            direction=direction, unit=unit,
            source_population="Twenty-seven corrected 1,337-frame conditions plus three separately labeled legacy 1,130-frame INT8 extensions.",
            n=None, canonical_condition="deployment variants; one PyTorch FP32 row per model is marked canonical for the default view",
            methods=records,
            provenance={"matrixFile": source_info["path"], "matrixSha256": source_info["sha256"], "int8ResultFiles": [{"path": info["path"], "sha256": info["sha256"]} for info in int8_info.values()]},
            overlay_type=field,
            visual_evidence_unavailable_reason="The deployment matrix contains aggregate condition outcomes and no frame-synchronized prediction media.",
        ))
    parity_by_key = {(r["model"], r["runtime"], r["metric"]): r for r in parity_rows}
    if len(parity_by_key) != len(parity_rows):
        raise ValueError("Deployment output-fidelity source has duplicate model/runtime/metric rows.")
    fidelity_fields = (
        ("diameter_delta_abs_px", "median", "diameter_delta_abs_px_median_vs_fp32", "Median absolute diameter change vs FP32", "px", 1),
        ("diameter_delta_abs_px", "changed_retention_count", "changed_retention_count_vs_fp32", "Changed retention decisions vs FP32", "frames", 1),
        ("pupil_C512_mask_disagreement_fraction", "median", "pupil_mask_disagreement_percent_median_vs_fp32", "Median pupil-mask disagreement vs FP32", "%", 100),
    )
    for source_metric, source_column, card_suffix, title, unit, scale in fidelity_fields:
        records = []
        for row in rows:
            method_id = row["methodId"]
            parity = parity_by_key.get((row["model"], row["runtime"], source_metric))
            if row["int8Extension"]:
                value = None
            else:
                if parity is None or as_number(parity.get("comparison_frames")) != 1337:
                    raise ValueError(f"Missing corrected same-frame output fidelity for {method_id}: {source_metric}")
                value = as_number(parity.get(source_column))
                if value is None:
                    raise ValueError(f"Missing measured output-fidelity value for {method_id}: {source_metric}")
                value *= scale
            record = {key: row.get(key) for key in (
                "methodId", "methodName", "family", "familyId", "architecture", "representation", "operatingPoint",
                "backend", "precision", "colorKey", "color", "familyColor", "checkpointHash", "comparisonCohort", "int8Extension",
            )}
            record.update(available_or_not(
                value,
                status="MEASURED_SAME_CHECKPOINT_1337" if value is not None else "NOT_COMPARABLE_DIFFERENT_VALIDATION_AND_CHECKPOINT",
                reason=None if value is not None else "INT8 used a different checkpoint and 1,130-frame legacy validation; no same-frame FP32 fidelity comparison is available.",
            ))
            record["n"] = as_number(parity.get("n")) if parity else None
            record["provenance"] = {
                "sourceFile": parity_info["path"], "sourceSha256": parity_info["sha256"],
                "metric": source_metric, "sourceColumn": source_column,
                "reference": parity.get("reference") if parity else None,
                "comparisonFrames": as_number(parity.get("comparison_frames")) if parity else None,
            }
            records.append(record)
        add_category_card(categories, "deployment", card_base(
            card_id=f"deployment-{card_suffix}", title=title, category="deployment",
            explanation="Same-frame output fidelity against each model's own PyTorch FP32 checkpoint on the corrected development validation. INT8 is unavailable for this comparison because its executed extension used a different checkpoint and validation set.",
            direction="lower", unit=unit,
            source_population="Corrected 1,337-frame SegFormer deployment parity; 27 comparable conditions.",
            n=None, canonical_condition="same checkpoint and same frames vs model-specific PyTorch FP32; per-metric paired N is recorded on each condition",
            methods=records,
            provenance={"parityCsv": parity_info["path"], "parityCsvSha256": parity_info["sha256"]},
            overlay_type=card_suffix,
            visual_evidence_unavailable_reason="The parity source contains paired aggregate summaries but no frame-synchronized prediction media.",
        ))
    return rows, {"matrixInfo": source_info, "int8Info": int8_info, "parityInfo": parity_info}


def parse_capabilities(
    identity: dict[str, Any], categories: dict[str, list[dict[str, Any]]], all_method_ids: set[str]
) -> tuple[dict[str, Any], list[dict[str, str]], dict[str, Any]]:
    rows, source_info = read_csv(CAPABILITIES_PATH, "source-grounded capability matrix")
    variant_by_method, family_map = get_identity_maps(identity)
    relevant_ids = set(all_method_ids) | set(variant_by_method)
    selected = [r for r in rows if r.get("method_id") in relevant_ids]
    by_capability: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in selected:
        capability_id = str(row.get("capability_short_name") or "unknown")
        by_capability[capability_id].append(row)
    capability_definitions = []
    for capability_id, entries in sorted(by_capability.items()):
        first = entries[0]
        capability_definitions.append({
            "id": capability_id,
            "name": first.get("plain_english_name") or capability_id,
            "description": first.get("plain_english_description"),
            "whyItMatters": first.get("why_it_matters"),
            "capabilityType": first.get("capability_type"),
            "methods": [
                {
                    "methodId": row.get("method_id"),
                    "methodName": row.get("display_label"),
                    "family": variant_by_method.get(str(row.get("method_id")), {}).get("family_id"),
                    "color": variant_by_method.get(str(row.get("method_id")), {}).get("color"),
                    "nativeSupport": row.get("native_support") or "UNKNOWN",
                    "implementedInOurBenchmark": row.get("implemented_in_our_benchmark") or "UNKNOWN",
                    "validatedInOurBenchmark": row.get("validated_in_our_benchmark") or "UNKNOWN",
                    "evidenceSource": sanitize_source_reference(row.get("evidence_source")),
                    "notes": row.get("notes") or None,
                }
                for row in entries
            ],
        })
    matrix = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceFile": source_info["path"],
        "sourceSha256": source_info["sha256"],
        "methodCount": len({str(row.get("method_id")) for row in selected}),
        "capabilityCount": len(capability_definitions),
        "capabilities": capability_definitions,
    }
    return matrix, selected, {"sourceInfo": source_info, "capabilityCount": len(by_capability), "methodCount": matrix["methodCount"]}


def read_real_frame_tables(
    evidence_rows: list[dict[str, str]], summary_rows: list[dict[str, str]]
) -> tuple[dict[str, dict[str, dict[str, str]]], dict[str, dict[str, Any]], dict[str, Any]]:
    tables: dict[str, dict[str, dict[str, str]]] = {}
    table_info: dict[str, dict[str, Any]] = {}
    summary_by_id = {(r.get("plane", ""), r.get("method_id", "")): r for r in summary_rows}
    # Prefer common-ellipse geometry rows; scalar mask rows are fallback records
    # for methods with no separate common-ellipse projection.
    candidates: dict[str, list[dict[str, str]]] = defaultdict(list)
    for evidence in evidence_rows:
        method_id = str(evidence.get("method_id", ""))
        plane = str(evidence.get("plane", ""))
        if not method_id or plane not in {"common_ellipse_geometry", "shared_scalar_mask_gt"}:
            continue
        candidates[method_id].append(evidence)
    for method_id, records in candidates.items():
        records.sort(key=lambda r: 0 if r.get("plane") == "common_ellipse_geometry" else 1)
        for evidence in records:
            path_string = str(evidence.get("frame_metrics_path") or "")
            if not path_string:
                continue
            try:
                rows, info = read_external_csv_reference(path_string, str(evidence.get("frame_metrics_sha256") or ""), "real-validation per-frame geometry predictions")
            except (FileNotFoundError, ValueError):
                continue
            by_sample = {str(r.get("sample_id")): r for r in rows if r.get("sample_id")}
            tables[method_id] = by_sample
            table_info[method_id] = {**info,
                "plane": evidence.get("plane"),
                "checkpointSha256": evidence.get("checkpoint_sha256"),
                "validationManifestSha256": evidence.get("validation_manifest_sha256"),
                "condition": summary_by_id.get((str(evidence.get("plane")), method_id), {}).get("condition"),
                "primaryConfidenceCutoff": as_number(summary_by_id.get((str(evidence.get("plane")), method_id), {}).get("primary_confidence_cutoff")),
            }
            break
    return tables, table_info, {"methodCount": len(tables)}


def build_real_visual_cases(
    identity: dict[str, Any],
    media_manifest: dict[str, Any] | None,
    evidence_rows: list[dict[str, str]],
    summary_rows: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not media_manifest:
        return [], {"methodCount": 0, "caseCount": 0}
    variant_by_method, family_map = get_identity_maps(identity)
    frame_tables, table_info, table_stats = read_real_frame_tables(evidence_rows, summary_rows)
    cases = []
    for raw_case in media_manifest.get("cases", []):
        case_id = str(raw_case.get("id") or raw_case.get("caseId") or "")
        if not case_id:
            continue
        trigger_rows = (raw_case.get("selection") or {}).get("triggers") or []
        triggers = [{
            "methodId": trigger.get("methodId"),
            "metric": trigger.get("metric"),
            "metricValue": as_number(trigger.get("metricValue")),
            "plane": trigger.get("plane"),
            "condition": trigger.get("condition"),
        } for trigger in trigger_rows]
        frames = []
        for media_frame in raw_case.get("frames", []):
            sample_id = str(media_frame.get("sampleId") or media_frame.get("frameId") or "")
            ref = media_frame.get("reference") or {}
            source_src = ref.get("src") or (media_frame.get("source") or {}).get("src")
            gt_src = ref.get("gt") or (media_frame.get("groundTruth") or {}).get("src")
            width = as_number((media_frame.get("source") or {}).get("width"))
            height = as_number((media_frame.get("source") or {}).get("height"))
            if width is None:
                width = as_number(media_frame.get("width"))
            if height is None:
                height = as_number(media_frame.get("height"))

            frame_methods: dict[str, Any] = {}
            gt_geometry = None
            for method_id, table in frame_tables.items():
                row = table.get(sample_id)
                if not row:
                    continue
                predicted_cx = as_number(row.get("predicted_center_x"))
                predicted_cy = as_number(row.get("predicted_center_y"))
                predicted_major = as_number(row.get("predicted_major_axis"))
                predicted_minor = as_number(row.get("predicted_minor_axis"))
                predicted_diameter = as_number(row.get("predicted_equivalent_diameter"))
                predicted_area = as_number(row.get("predicted_area"))
                valid = as_bool(row.get("valid"))
                accepted = as_bool(row.get("retained"))
                if accepted is None:
                    accepted = valid
                confidence = as_number(row.get("confidence"))
                failure = str(row.get("failure_code") or "")
                method_geometry: dict[str, Any] = {
                    "accepted": accepted,
                    "confidence": confidence,
                    "threshold": table_info.get(method_id, {}).get("primaryConfidenceCutoff"),
                    "rejectionReason": failure if failure and failure.upper() != "NONE" else ("NOT_VALID" if valid is False else None),
                    "diameter": predicted_diameter,
                    "area": predicted_area,
                    "errorPx": as_number(row.get("centroid_error_px")),
                    "mask": None,
                    "orientationAvailable": False,
                }
                if predicted_cx is not None and predicted_cy is not None:
                    method_geometry["center"] = {"x": predicted_cx, "y": predicted_cy}
                if predicted_cx is not None and predicted_cy is not None and (predicted_major is not None or predicted_minor is not None):
                    ellipse = {"cx": predicted_cx, "cy": predicted_cy, "orientationAvailable": False}
                    if predicted_major is not None:
                        ellipse["major"] = predicted_major
                    if predicted_minor is not None:
                        ellipse["minor"] = predicted_minor
                    # Rotation is deliberately omitted: the frozen real-validation
                    # frame table does not export angle in this projection.
                    method_geometry["ellipse"] = ellipse
                frame_methods[method_id] = {
                    "accepted": accepted,
                    "confidence": confidence,
                    "threshold": table_info.get(method_id, {}).get("primaryConfidenceCutoff"),
                    "rejectionReason": method_geometry["rejectionReason"],
                    "geometry": method_geometry,
                    "predictionMask": None,
                    "provenance": {
                        "frameMetricsFile": table_info.get(method_id, {}).get("path"),
                        "frameMetricsSha256": table_info.get(method_id, {}).get("sha256"),
                        "coordinateSpace": "frozen scored ROI pixels",
                    },
                }
                if gt_geometry is None:
                    true_cx = as_number(row.get("true_center_x"))
                    true_cy = as_number(row.get("true_center_y"))
                    true_diameter = as_number(row.get("true_equivalent_diameter"))
                    true_area = as_number(row.get("true_area"))
                    true_major = as_number(row.get("true_major_axis"))
                    true_minor = as_number(row.get("true_minor_axis"))
                    gt_geometry = {
                        "mask": {"src": gt_src} if gt_src else None,
                        "diameter": true_diameter,
                        "area": true_area,
                        "orientationAvailable": False,
                        "coordinateSpace": "frozen scored ROI pixels",
                    }
                    if true_cx is not None and true_cy is not None:
                        gt_geometry["center"] = {"x": true_cx, "y": true_cy}
                    if true_cx is not None and true_cy is not None and (true_major is not None or true_minor is not None):
                        ellipse = {"cx": true_cx, "cy": true_cy, "orientationAvailable": False}
                        if true_major is not None:
                            ellipse["major"] = true_major
                        if true_minor is not None:
                            ellipse["minor"] = true_minor
                        gt_geometry["ellipse"] = ellipse

            reference = {
                "src": source_src,
                "image": source_src,
                "gt": gt_src,
                "mask": {"src": gt_src} if gt_src else None,
                "sourceSha256": ref.get("sourceSha256") or media_frame.get("sourceHash"),
                "gtSha256": ref.get("gtSha256") or media_frame.get("gtHash"),
                "coordinateSpace": ref.get("coordinateSpace") or "frozen scored ROI pixels; no resampling",
            }
            if gt_geometry:
                # The site normalizes `reference.geometry` into FrameGeometry.
                # Keep the binary GT URL inside that same object so the mask
                # survives normalization together with the direct geometry.
                gt_geometry = dict(gt_geometry)
                gt_geometry["mask"] = {"src": gt_src} if gt_src else None
                reference["geometry"] = gt_geometry
                reference.update(gt_geometry)
                reference["src"] = source_src
                reference["image"] = source_src
                reference["gt"] = gt_src
                reference["mask"] = {"src": gt_src} if gt_src else None
            frames.append({
                "frameIndex": as_number(media_frame.get("frameIndex")) or 0,
                "sourceFrameNumber": as_number(media_frame.get("sourceFrameNumber")),
                "timestampMs": as_number(media_frame.get("timestampMs")),
                "width": width, "height": height,
                "sourceId": sample_id,
                "sourceSrc": source_src,
                "reference": reference,
                "methods": frame_methods,
                "mediaHashes": {
                    "sourceScoredRoiSha256": ref.get("sourceSha256") or media_frame.get("sourceHash"),
                    "gtScoredRoiSha256": ref.get("gtSha256") or media_frame.get("gtHash"),
                    "sourceOriginalSha256": (media_frame.get("source") or {}).get("originalSha256"),
                    "gtOriginalSha256": (media_frame.get("groundTruth") or {}).get("originalSha256"),
                },
            })
        if not frames:
            continue
        case = {
            "id": case_id,
            "label": raw_case.get("label") or case_id,
            "mode": raw_case.get("mode") or "representative",
            "outcomeSelected": bool((raw_case.get("selection") or {}).get("outcomeSelected")),
            "representative": bool((raw_case.get("selection") or {}).get("representative")),
            "category": "real_validation",
            "sourceId": raw_case.get("sourceId"),
            "sourceHash": raw_case.get("sourceHash"),
            "family": raw_case.get("family"),
            "sizeStratum": raw_case.get("sizeStratum"),
            "difficultyProxyFlags": raw_case.get("difficultyProxyFlags"),
            "perturbation": "real validation; no synthetic perturbation",
            "sourcePopulation": "REAL_VALIDATION_VISUAL_FREEZE_V1; frozen source and GT only for representative selection",
            "triggerMethodIds": raw_case.get("triggerMethodIds", []),
            "qcTriggers": triggers,
            "selectionPolicy": (raw_case.get("selection") or {}).get("rule"),
            "frames": frames,
        }
        cases.append(case)
    acquisition_families = sorted({
        str(row.get("component_id"))
        for table in frame_tables.values()
        for row in table.values()
        if row.get("component_id")
    })
    return cases, table_stats | {"caseCount": len(cases), "methodFrameTables": table_info, "acquisitionFamilyIds": acquisition_families}


def build_website_visual_cases_index(manifest: dict[str, Any], manifest_info: dict[str, Any]) -> dict[str, Any]:
    """Create a source/GT-only index of the frozen real-validation visual cases."""
    cases = []
    for raw_case in manifest.get("cases", []):
        selection = raw_case.get("selection") or {}
        frames = []
        for raw_frame in raw_case.get("frames", []):
            reference = raw_frame.get("reference") or {}
            source = raw_frame.get("source") or {}
            ground_truth = raw_frame.get("groundTruth") or {}
            frames.append({
                "frameId": raw_frame.get("frameId") or raw_frame.get("sampleId"),
                "frameIndex": as_number(raw_frame.get("frameIndex")),
                "sourceFrameNumber": as_number(raw_frame.get("sourceFrameNumber")),
                "timestampMs": as_number(raw_frame.get("timestampMs")),
                "timestampStatus": raw_frame.get("timestampStatus"),
                "source": {
                    "src": source.get("src") or reference.get("src"),
                    "sha256": source.get("sha256") or raw_frame.get("sourceHash") or reference.get("sourceSha256"),
                    "width": as_number(source.get("width")),
                    "height": as_number(source.get("height")),
                    "coordinateSpace": source.get("coordinateSpace") or reference.get("coordinateSpace"),
                },
                "groundTruth": {
                    "src": ground_truth.get("src") or reference.get("gt"),
                    "sha256": ground_truth.get("sha256") or raw_frame.get("gtHash") or reference.get("gtSha256"),
                    "encoding": ground_truth.get("encoding"),
                    "coordinateSpace": reference.get("coordinateSpace"),
                },
            })
        cases.append({
            "id": raw_case.get("id") or raw_case.get("caseId"),
            "label": raw_case.get("label"),
            "mode": raw_case.get("mode"),
            "representative": bool(selection.get("representative")),
            "outcomeSelected": bool(selection.get("outcomeSelected")),
            "sourceId": raw_case.get("sourceId"),
            "sourceHash": raw_case.get("sourceHash"),
            "family": raw_case.get("family"),
            "sizeStratum": raw_case.get("sizeStratum"),
            "difficultyProxyFlags": raw_case.get("difficultyProxyFlags"),
            "selection": {
                "source": selection.get("source"),
                "rule": selection.get("rule"),
                "sequenceContextRule": selection.get("sequenceContextRule"),
            },
            "triggerMethodIds": raw_case.get("triggerMethodIds", []),
            "frameIds": raw_case.get("frameIds", []),
            "timestampsMs": raw_case.get("timestampsMs", []),
            "frames": frames,
        })
    media_policy = dict(manifest.get("mediaPolicy", {}))
    media_policy.pop("publicMediaRoot", None)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "schema": "WEBSITE_VISUAL_CASES_V1",
        "sourceManifest": {
            "path": manifest_info.get("path"),
            "sha256": manifest_info.get("sha256"),
            "schema": manifest.get("schema"),
            "benchmarkVersion": manifest.get("benchmarkVersion"),
        },
        "createdFrom": manifest.get("createdFrom", {}),
        "mediaPolicy": media_policy,
        "selectionPolicy": manifest.get("selectionPolicy", {}),
        "counts": manifest.get("counts", {}),
        "cases": cases,
    }


def build_exact_gt_visual_cases(
    identity: dict[str, Any],
    manifest: dict[str, Any] | None,
    real_case_ids: set[str],
    frame_rows_by_method: dict[str, dict[str, dict[str, str]]],
    frame_metric_sources: dict[str, dict[str, Any]],
    prediction_media_manifest: dict[str, Any] | None = None,
    prediction_media_source_manifest: dict[str, Any] | None = None,
    prediction_media_manifest_info: dict[str, Any] | None = None,
    severity_prediction_media_manifest: dict[str, Any] | None = None,
    severity_prediction_media_manifest_info: dict[str, Any] | None = None,
    prediction_comparison_manifest: dict[str, Any] | None = None,
    prediction_comparison_manifest_info: dict[str, Any] | None = None,
    severity_pupil_gt_manifest: dict[str, Any] | None = None,
    severity_pupil_gt_manifest_info: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if not manifest:
        return []
    cases = []
    variant_by_method, family_map = get_identity_maps(identity)
    prediction_media_by_key = {
        (str(row.get("executionId") or ""), str(row.get("methodId") or "")): row
        for row in (prediction_media_manifest or {}).get("assets", [])
    }
    severity_prediction_media_by_key = {
        (str(row.get("executionId") or ""), str(row.get("methodId") or "")): row
        for row in (severity_prediction_media_manifest or {}).get("assets", [])
    }
    if len(severity_prediction_media_by_key) != len((severity_prediction_media_manifest or {}).get("assets", [])):
        raise ValueError("Exact-GT severity prediction media manifest contains duplicate case/method assets.")
    if severity_prediction_media_manifest:
        if severity_prediction_media_manifest.get("schema") != "EXACT_GT_V21_SEVERITY_PUBLIC_PREDICTION_MEDIA_V1":
            raise ValueError("Unsupported Exact-GT V2.1 severity prediction media manifest schema.")
        if int(severity_prediction_media_manifest.get("caseCount") or -1) != 18:
            raise ValueError("Exact-GT severity prediction media manifest must cover all 18 frozen cases.")
        if int(severity_prediction_media_manifest.get("assetCount") or -1) != len(severity_prediction_media_by_key):
            raise ValueError("Exact-GT severity prediction media manifest has an incorrect asset count.")
    severity_pupil_gt_by_case = {
        str(row.get("caseId") or row.get("executionId") or ""): row
        for row in (severity_pupil_gt_manifest or {}).get("assets", [])
    }
    if len(severity_pupil_gt_by_case) != len((severity_pupil_gt_manifest or {}).get("assets", [])):
        raise ValueError("Exact-GT severity binary pupil-GT manifest contains duplicate case assets.")
    if severity_pupil_gt_manifest:
        if severity_pupil_gt_manifest.get("schema") != "EXACT_GT_V21_SEVERITY_PUPIL_GT_MEDIA_V1":
            raise ValueError("Unsupported Exact-GT severity binary pupil-GT manifest schema.")
        if int(severity_pupil_gt_manifest.get("caseCount") or -1) != 18 or int(severity_pupil_gt_manifest.get("assetCount") or -1) != len(severity_pupil_gt_by_case):
            raise ValueError("Exact-GT severity binary pupil-GT manifest must cover all 18 frozen cases.")
        current_grid_hash = str((severity_pupil_gt_manifest_info or {}).get("sourceGridManifestSha256") or "").lower()
        if current_grid_hash and str(severity_pupil_gt_manifest.get("sourceGridManifestSha256") or "").lower() != current_grid_hash:
            raise ValueError("Exact-GT severity binary pupil-GT manifest was generated from a different frozen grid.")
    prediction_comparison_by_key = {
        (str(row.get("caseId") or ""), str(row.get("methodId") or "")): row
        for row in (prediction_comparison_manifest or {}).get("assets", [])
    }
    if len(prediction_comparison_by_key) != len((prediction_comparison_manifest or {}).get("assets", [])):
        raise ValueError("Exact-GT comparison media manifest contains duplicate case/method assets.")
    if prediction_comparison_manifest:
        if prediction_comparison_manifest.get("schema") != "EXACT_GT_V21_PREDICTION_COMPARISON_MEDIA_V1":
            raise ValueError("Unsupported Exact-GT V2.1 prediction comparison media manifest schema.")
        if int(prediction_comparison_manifest.get("assetCount") or -1) != len(prediction_comparison_by_key):
            raise ValueError("Exact-GT prediction comparison media manifest has an incorrect asset count.")
    source_cases_by_id = {
        str(row.get("id") or row.get("executionId") or ""): row
        for row in (prediction_media_source_manifest or {}).get("cases", [])
    }
    if prediction_media_manifest:
        if prediction_media_manifest.get("schema") != "EXACT_GT_V21_SELECTED_PUBLIC_PREDICTION_MEDIA_HASH_MANIFEST_V1":
            raise ValueError("Unsupported selected Exact-GT public prediction media manifest schema.")
        if int(prediction_media_manifest.get("assetCount") or -1) != len(prediction_media_by_key):
            raise ValueError("Selected Exact-GT public prediction media manifest has duplicate or missing assets.")
        expected_candidate_sha = str(prediction_media_manifest.get("sourceCandidateManifestSha256") or "").lower()
        actual_candidate_sha = str((prediction_media_manifest_info or {}).get("sourceManifestSha256") or "").lower()
        if expected_candidate_sha and actual_candidate_sha and expected_candidate_sha != actual_candidate_sha:
            raise ValueError("Selected Exact-GT prediction media manifest does not match its source candidate manifest.")

    def num(row: dict[str, str], *keys: str) -> int | float | None:
        for key in keys:
            value = as_number(row.get(key))
            if value is not None:
                return value
        return None

    def geometry_from_row(row: dict[str, str]) -> dict[str, Any] | None:
        center_x = num(row, "predicted_center_x", "center_x", "native_center_x")
        center_y = num(row, "predicted_center_y", "center_y", "native_center_y")
        diameter = num(row, "predicted_equivalent_diameter", "equivalent_diameter", "native_diameter_px")
        area = num(row, "predicted_area", "area")
        major = num(row, "predicted_major_axis", "major_axis")
        minor = num(row, "predicted_minor_axis", "minor_axis")
        angle_rad = num(row, "predicted_orientation_rad", "predicted_angle_rad", "orientation_rad")
        angle_deg = num(row, "native_angle_deg")
        if angle_rad is None and angle_deg is not None:
            # Only a unit conversion of the source-native angle; preserve the
            # original degree-valued field in nativeEllipse below.
            angle_rad = math.radians(angle_deg)
        ellipse = None
        if center_x is not None and center_y is not None and major is not None and minor is not None:
            ellipse = {"cx": center_x, "cy": center_y, "major": major, "minor": minor}
            if angle_rad is not None:
                ellipse["angleRad"] = angle_rad
        geometry: dict[str, Any] = {
            "center": {"x": center_x, "y": center_y} if center_x is not None and center_y is not None else None,
            "ellipse": ellipse,
            "diameter": diameter,
            "area": area,
            "orientationAvailable": angle_rad is not None,
        }
        if row.get("native_width_px") or row.get("native_height_px") or row.get("native_angle_deg"):
            geometry["nativeEllipse"] = {
                "widthPx": num(row, "native_width_px"),
                "heightPx": num(row, "native_height_px"),
                "angleDegrees": angle_deg,
            }
            # The frozen PupilEXT row reports width/height and angle in its
            # native convention. Keep those direct values without asserting
            # major/minor axis ordering for a display ellipse.
        return geometry if any(value is not None for value in (center_x, center_y, diameter, area, major, minor, angle_rad, angle_deg)) else None

    def gt_geometry_from_row(row: dict[str, str], mask_src: str | None) -> dict[str, Any] | None:
        center_x = num(row, "true_center_x", "gt_center_x")
        center_y = num(row, "true_center_y", "gt_center_y")
        diameter = num(row, "true_equivalent_diameter", "gt_equivalent_diameter")
        area = num(row, "true_area", "gt_area")
        major = num(row, "true_major_axis", "gt_major_axis")
        minor = num(row, "true_minor_axis", "gt_minor_axis")
        angle_rad = num(row, "true_orientation_rad", "gt_orientation_rad", "true_angle_rad")
        geometry = {
            "center": {"x": center_x, "y": center_y} if center_x is not None and center_y is not None else None,
            "ellipse": {
                "cx": center_x, "cy": center_y, "major": major, "minor": minor,
                "angleRad": angle_rad,
            } if center_x is not None and center_y is not None and major is not None and minor is not None else None,
            "diameter": diameter,
            "area": area,
            "orientationAvailable": angle_rad is not None,
            "mask": {"src": mask_src} if mask_src else None,
            "coordinateSpace": "frozen Exact-GT transformed source pixel coordinates",
        }
        return geometry if any(value is not None for value in (center_x, center_y, diameter, area, major, minor, angle_rad)) else None

    metric_keys = (
        "dice", "iou", "assd_px", "hd95_px", "diameter_are", "diameter_mae_px",
        "diameter_signed_error_px", "center_error_px", "area_are", "major_axis_are",
        "minor_axis_are", "orientation_error_deg",
    )
    native_hash_keys = (
        "native_predictions_sha256", "native_predictions_file_sha256", "native_keypoints_sha256",
        "prediction_sha256", "mask_128_sha256",
    )

    for raw in manifest.get("cases", []):
        case_id = str(raw.get("id") or raw.get("caseId") or "")
        if not case_id:
            continue
        manifest_method_rows = raw.get("methods") or {}
        source_frames = raw.get("frames") or []
        raw_frame = source_frames[0] if source_frames else {}
        raw_reference = raw_frame.get("reference") or {}
        media_hashes = raw_frame.get("mediaHashes") or {}
        exact_gt = raw_frame.get("exactGT") or {
            "src": raw_reference.get("gt"),
            "sha256": media_hashes.get("exactGtSha256") or media_hashes.get("primaryGtSha256"),
            "pupilMaskSha256": media_hashes.get("exactGtPupilMaskSha256"),
            "geometry": raw_reference.get("geometry"),
        }
        transformed_src = raw_frame.get("transformedSourceSrc") or raw_frame.get("sourceSrc") or raw_reference.get("src")
        gt_src = exact_gt.get("src") or raw_reference.get("gt")
        width = as_number(raw.get("width") or raw_frame.get("width"))
        height = as_number(raw.get("height") or raw_frame.get("height"))
        pupil_gt_asset = severity_pupil_gt_by_case.get(case_id)
        pupil_gt_src = str(pupil_gt_asset.get("publicUrl") or "") if pupil_gt_asset else gt_src
        pupil_gt_sha = str(pupil_gt_asset.get("publicSha256") or "").lower() if pupil_gt_asset else None
        expected_source_hash = str(raw_frame.get("transformedSourceSha256") or media_hashes.get("transformedSourceSha256") or "").lower()
        expected_gt_hash = str(exact_gt.get("sha256") or exact_gt.get("pupilMaskSha256") or media_hashes.get("primaryGtSha256") or "").lower()
        expected_row_index = str(raw.get("rowIndex") if raw.get("rowIndex") is not None else "")
        if pupil_gt_asset:
            if (str(pupil_gt_asset.get("caseId") or "") != case_id
                    or str(pupil_gt_asset.get("rowIndex")) != expected_row_index
                    or str(pupil_gt_asset.get("sourceImageSha256") or "").lower() != expected_source_hash
                    or str(pupil_gt_asset.get("primaryGtSha256") or "").lower() != expected_gt_hash
                    or not str(pupil_gt_asset.get("primaryGtPath") or "")
                    or PurePosixPath(str(pupil_gt_asset.get("publicPath") or "")).is_absolute()):
                raise ValueError(f"Exact-GT binary pupil-only mask identity does not match selected case {case_id}.")
            if as_number(pupil_gt_asset.get("width")) != width or as_number(pupil_gt_asset.get("height")) != height:
                raise ValueError(f"Exact-GT binary pupil-only mask dimensions do not match selected case {case_id}.")
            gt_area = next((
                as_number(row.get(key))
                for table in frame_rows_by_method.values()
                for row in [table.get(case_id)] if row
                for key in ("true_area", "truth_area", "gt_area")
                if as_number(row.get(key)) is not None
            ), None)
            if gt_area is not None and as_number(pupil_gt_asset.get("pupilPixelCount")) != gt_area:
                raise ValueError(f"Exact-GT binary pupil-only mask area does not match frozen GT geometry for {case_id}.")

        def display_geometry(value: Any, mask_src: str | None = None) -> dict[str, Any] | None:
            if not isinstance(value, dict):
                return None
            center_x = as_number(value.get("center_x"))
            center_y = as_number(value.get("center_y"))
            major = as_number(value.get("major_axis"))
            minor = as_number(value.get("minor_axis"))
            geometry = {
                "center": {"x": center_x, "y": center_y} if center_x is not None and center_y is not None else None,
                "ellipse": {
                    "cx": center_x, "cy": center_y,
                    "major": major, "minor": minor,
                    "angleRad": as_number(value.get("angle_rad")),
                } if center_x is not None and center_y is not None and major is not None and minor is not None else None,
                "diameter": as_number(value.get("equivalent_diameter")),
                "area": as_number(value.get("area")),
                "orientationAvailable": as_number(value.get("angle_rad")) is not None,
                "mask": {"src": mask_src} if mask_src else None,
            }
            return geometry

        reference = {
            "src": transformed_src,
            "image": transformed_src,
            "gt": gt_src,
            "mask": ({"src": pupil_gt_src, "sha256": pupil_gt_sha, "kind": "binary_pupil_ground_truth"} if pupil_gt_asset and pupil_gt_src else {"src": gt_src} if gt_src else None),
            "sourceSha256": raw_frame.get("transformedSourceSha256") or media_hashes.get("transformedSourceSha256"),
            "gtSha256": exact_gt.get("pupilMaskSha256") or exact_gt.get("sha256"),
            "pupilMaskSha256": pupil_gt_sha or exact_gt.get("pupilMaskSha256") or exact_gt.get("sha256"),
            "gtNativeSrc": exact_gt.get("nativeSrc"),
            "coordinateSpace": "frozen transformed-source pixel coordinates; no resizing",
            "geometry": display_geometry(raw.get("gtGeometry") or exact_gt.get("geometry"), gt_src),
        }
        methods = {}
        reference_geometry = reference.get("geometry")
        for method_id, row_table in frame_rows_by_method.items():
            row = row_table.get(case_id)
            source_info = frame_metric_sources.get(method_id, {})
            match_error = None
            if row is None:
                match_error = "No canonical per-frame row has this execution ID."
            else:
                row_source_hash = str(row.get("source_image_sha256") or row.get("image_sha256") or "").lower()
                row_gt_hash = str(row.get("primary_gt_sha256") or row.get("gt_mask_sha256") or "").lower()
                if expected_source_hash and row_source_hash != expected_source_hash:
                    match_error = "The canonical row source-image hash does not match the selected transformed source."
                elif expected_gt_hash and row_gt_hash != expected_gt_hash:
                    match_error = "The canonical row GT hash does not match the selected exact-GT mask."
                elif expected_row_index and str(row.get("row_index") or "") != expected_row_index:
                    match_error = "The canonical row index does not match the selected case row index."

            mask_asset = prediction_media_by_key.get((case_id, method_id))
            severity_mask_asset = severity_prediction_media_by_key.get((case_id, method_id))
            mask_asset = mask_asset or severity_mask_asset
            active_mask_manifest_info = (
                severity_prediction_media_manifest_info if severity_mask_asset
                else prediction_media_manifest_info
            ) or {}
            candidate_case = source_cases_by_id.get(case_id)
            candidate_method = ((candidate_case or {}).get("methods") or {}).get(method_id) or {}
            if mask_asset and not match_error:
                asset_identity_matches = (
                    str(mask_asset.get("rowIndex")) == expected_row_index
                    and str(mask_asset.get("sourceImageSha256") or "").lower() == expected_source_hash
                    and str(mask_asset.get("primaryGtSha256") or "").lower() == expected_gt_hash
                )
                if severity_mask_asset:
                    # The severity exporter records canonical array/ledger
                    # identity directly because these rows are prediction-blind
                    # media selections and have no outcome-QC candidate file.
                    asset_identity_matches = asset_identity_matches and (
                        str(mask_asset.get("methodStatus")) == "MEASURED_NATIVE_MASK"
                        and str(mask_asset.get("sourceGridManifestSha256") or severity_prediction_media_manifest.get("sourceGridManifestSha256") or "").lower()
                        == str((severity_prediction_media_manifest_info or {}).get("sourceGridManifestSha256") or severity_prediction_media_manifest.get("sourceGridManifestSha256") or "").lower()
                        and str(mask_asset.get("publicSha256") or "").lower() != ""
                    )
                    for source_key, sha_key, source_role in (
                        ("nativePredictionCsvPath", "nativePredictionCsvSha256", "Exact-GT severity native prediction CSV supporting exported native mask"),
                        ("scoreCsvPath", "scoreCsvSha256", "Exact-GT severity score CSV identity for exported native mask"),
                        ("nativeArrayPath", "nativeArraySha256", "Exact-GT severity retained packed prediction array"),
                        ("nativeShapeArrayPath", "nativeShapeArraySha256", "Exact-GT severity retained prediction shape ledger"),
                        ("nativeOutputArtifactPath", "nativeOutputArtifactSha256", "Exact-GT severity row-level native prediction artifact"),
                    ):
                        source_path = mask_asset.get(source_key)
                        expected_sha = str(mask_asset.get(sha_key) or "").lower()
                        if source_path and expected_sha:
                            source_record = register_input(ROOT / str(source_path), source_role)
                            if source_record["sha256"].lower() != expected_sha:
                                asset_identity_matches = False
                    expected_score_source = str(source_info.get("path") or "")
                    if str(mask_asset.get("scoreCsvPath") or "") != expected_score_source:
                        asset_identity_matches = False
                    if str(mask_asset.get("scoreCsvSha256") or "").lower() != str(source_info.get("sha256") or "").lower():
                        asset_identity_matches = False
                    if as_number(mask_asset.get("nativeRank")) != as_number(expected_row_index):
                        asset_identity_matches = False
                else:
                    asset_identity_matches = asset_identity_matches and (
                        str(mask_asset.get("publicSha256") or "").lower() == str(mask_asset.get("sourceCandidateSha256") or "").lower()
                        and str(((candidate_method.get("predictionMask") or {}).get("sha256") if isinstance(candidate_method.get("predictionMask"), dict) else "") or "").lower() == str(mask_asset.get("sourceCandidateSha256") or "").lower()
                    )
                public_path = PurePosixPath(str(mask_asset.get("publicPath") or ""))
                site_public_prefix = PurePosixPath("benchmark_site/public")
                if not asset_identity_matches:
                    match_error = "The public prediction-mask asset does not match the frozen case, method, source, GT, and row identity."
                elif public_path.is_absolute() or public_path.parts[:2] != site_public_prefix.parts:
                    match_error = "The prediction-mask asset path is outside the benchmark site's public media directory."
                else:
                    prediction_mask_url = "/" + public_path.relative_to(site_public_prefix).as_posix()
            else:
                prediction_mask_url = None

            comparison_asset = prediction_comparison_by_key.get((case_id, method_id))
            comparison_public_url = None
            if comparison_asset and not match_error:
                comparison_identity_matches = (
                    mask_asset is not None
                    and str(comparison_asset.get("rowIndex")) == expected_row_index
                    and str(comparison_asset.get("sourceImageSha256") or "").lower() == expected_source_hash
                    and str(comparison_asset.get("primaryGtSha256") or "").lower() == expected_gt_hash
                    and str(comparison_asset.get("predictionMaskUrl") or "") == str(prediction_mask_url or "")
                    and str(comparison_asset.get("predictionMaskSha256") or "").lower() == str(mask_asset.get("publicSha256") or "").lower()
                    and str(comparison_asset.get("legend") or "") == str((prediction_comparison_manifest or {}).get("legend") or "")
                )
                comparison_path = PurePosixPath(str(comparison_asset.get("comparisonPath") or ""))
                if not comparison_identity_matches:
                    match_error = "The overlap-map asset does not match the selected method, row, source, GT, and prediction-mask identity."
                elif comparison_path.is_absolute() or comparison_path.parts[:2] != PurePosixPath("benchmark_site/public").parts:
                    match_error = "The overlap-map asset path is outside the benchmark site's public media directory."
                else:
                    comparison_public_url = "/" + comparison_path.relative_to(PurePosixPath("benchmark_site/public")).as_posix()
            elif prediction_mask_url and not comparison_asset and raw.get("category") == "exact_gt":
                # Geometry-only methods have no mask comparison. Mask-producing
                # selected rows without a comparison manifest remain explicit.
                pass

            variant = variant_by_method.get(method_id, {})
            record = method_base(
                method_id, variant_by_method, family_map,
                representation=variant.get("representation") or "native V2.1 source output; per-frame canonical score row",
                operating_point="frozen Exact-GT V2.1 spatial output",
                canonical=True,
            )
            if match_error:
                record.update({
                    "accepted": None,
                    "confidence": None,
                    "threshold": None,
                    "geometry": None,
                    "predictionMask": None,
                    "unavailable": True,
                    "status": "NOT_AVAILABLE_FOR_SELECTED_CASE",
                    "unavailableReason": match_error,
                    "provenance": {"frameMetricsFile": source_info.get("path"), "frameMetricsSha256": source_info.get("sha256")},
                })
            else:
                assert row is not None
                if reference_geometry is None:
                    reference_geometry = gt_geometry_from_row(row, gt_src)
                source_valid = as_bool(row.get("valid"))
                method_qc = manifest_method_rows.get(method_id) or {}
                native_hash = next((row.get(key) for key in native_hash_keys if row.get(key)), None)
                values = {key: as_number(row.get(key)) for key in metric_keys}
                if all(value is None for value in values.values()):
                    values = dict(method_qc.get("values") or {})
                mask_sha = row.get("mask_128_sha256")
                prediction_geometry = geometry_from_row(row) or display_geometry(method_qc.get("geometry"))
                if prediction_geometry and prediction_mask_url:
                    prediction_geometry["mask"] = {"src": prediction_mask_url}
                record.update({
                    "accepted": source_valid,
                    "acceptance": "ACCEPTED" if source_valid else "REJECTED" if source_valid is False else None,
                    "confidence": num(row, "native_confidence", "confidence", "outline_confidence"),
                    "threshold": as_number(method_qc.get("threshold")),
                    "rejectionReason": row.get("failure_code") or row.get("failure") or method_qc.get("failureCode"),
                    "geometry": prediction_geometry,
                    "keypoints": method_qc.get("keypoints") or [],
                    "predictionMask": prediction_mask_url,
                    "maskComparison": ({
                        "src": comparison_public_url,
                        "sha256": comparison_asset.get("comparisonSha256"),
                        "legend": comparison_asset.get("legend"),
                        "coordinateSystem": comparison_asset.get("coordinateSystem"),
                    } if comparison_asset and comparison_public_url else None),
                    "maskComparisonUnavailableReason": (
                        None if comparison_asset and comparison_public_url else
                        "A hash-joined native segmentation mask and exact-GT pixel comparison is not available for this method/case."
                    ),
                    "maskMetrics": {key: values.get(key) for key in ("dice", "iou", "assd_px", "hd95_px")},
                    "values": values,
                    "nativeMethodId": method_qc.get("nativeMethodId") or method_id,
                    "nativeIdentity": method_qc.get("nativeIdentity") or {"nativeOutputSha256": native_hash} if native_hash else method_qc.get("nativeIdentity"),
                    "unavailable": False,
                    "status": "MEASURED_ACCEPTED" if source_valid else "MEASURED_REJECTED" if source_valid is False else "MEASURED_STATUS_UNKNOWN",
                    "predictionMaskSha256": mask_asset.get("publicSha256") if mask_asset and prediction_mask_url else None,
                    "maskOverlayUnavailableReason": None if prediction_mask_url else "No method prediction-mask asset is present in the bounded static media export.",
                    "nativeEllipse": geometry_from_row(row).get("nativeEllipse") if geometry_from_row(row) else None,
                    "provenance": {
                        "frameMetricsFile": source_info.get("path"),
                        "frameMetricsSha256": source_info.get("sha256"),
                        "rowIndex": as_number(row.get("row_index")),
                        "executionId": row.get("execution_id"),
                        "sourceSampleId": row.get("source_sample_id"),
                        "sourceImageSha256": row.get("source_image_sha256") or row.get("image_sha256"),
                        "primaryGtSha256": row.get("primary_gt_sha256") or row.get("gt_mask_sha256"),
                        "nativeOutputSha256": native_hash,
                        "maskOutputSha256": mask_sha,
                    "predictionMediaManifest": active_mask_manifest_info.get("path"),
                    "predictionMediaManifestSha256": active_mask_manifest_info.get("sha256"),
                    "predictionComparisonManifest": (prediction_comparison_manifest_info or {}).get("path") if comparison_asset else None,
                    "predictionComparisonManifestSha256": (prediction_comparison_manifest_info or {}).get("sha256") if comparison_asset else None,
                    "predictionMaskSha256": mask_asset.get("publicSha256") if mask_asset and prediction_mask_url else None,
                    "predictionMaskCoordinateSystem": mask_asset.get("coordinateSystem") if mask_asset and prediction_mask_url else None,
                    "nativeArrayPath": mask_asset.get("nativeArrayPath") if severity_mask_asset else None,
                    "nativeArraySha256": mask_asset.get("nativeArraySha256") if severity_mask_asset else None,
                    "nativePredictionCsvPath": mask_asset.get("nativePredictionCsvPath") if severity_mask_asset else None,
                    "nativePredictionCsvSha256": mask_asset.get("nativePredictionCsvSha256") if severity_mask_asset else None,
                },
                })
            methods[method_id] = record
        reference["geometry"] = reference_geometry
        if reference_geometry:
            reference["geometry"]["mask"] = ({"src": pupil_gt_src, "sha256": pupil_gt_sha, "kind": "binary_pupil_ground_truth"} if pupil_gt_asset and pupil_gt_src else {"src": gt_src} if gt_src else None)
        frame = {
            "frameIndex": 0,
            "sourceFrameNumber": as_number(raw_frame.get("sourceFrameNumber")),
            "timestampMs": as_number(raw_frame.get("timestampMs")),
            "width": width, "height": height,
            "sourceId": raw.get("sourceId") or case_id,
            "sourceSrc": transformed_src,
            "originalSourceSrc": raw.get("originalSourceSrc"),
            "transformedSourceSrc": transformed_src,
            "reference": reference,
            "methods": methods,
            "mediaHashes": {
                "originalSourceSha256": raw.get("originalSourceSha256") or media_hashes.get("originalSourceSha256"),
                "originalGroundTruthSha256": raw.get("originalGroundTruthSha256") or raw.get("originalSourceGTMaskSha256"),
                "transformedSourceSha256": raw_frame.get("transformedSourceSha256") or media_hashes.get("transformedSourceSha256"),
                "exactGtSha256": media_hashes.get("exactGtPupilMaskSha256") or media_hashes.get("exactGtSha256") or media_hashes.get("primaryGtSha256") or exact_gt.get("pupilMaskSha256") or exact_gt.get("sha256"),
                "exactGtNativeSha256": exact_gt.get("sha256") or media_hashes.get("exactGtSha256") or media_hashes.get("primaryGtSha256"),
                "exactGtPupilMaskSha256": exact_gt.get("pupilMaskSha256") or media_hashes.get("exactGtPupilMaskSha256"),
                "binaryPupilGtSha256": pupil_gt_sha,
            },
            "transform": raw.get("coordinateTransform"),
        }
        cases.append({
            "id": case_id,
            "label": raw.get("label") or case_id,
            "mode": raw.get("mode") or "representative",
            "outcomeSelected": bool(raw.get("outcomeSelected") or raw.get("mode") == "worst_case"),
            "representative": bool(raw.get("representative") or raw.get("mode") == "representative"),
            "category": "exact_gt",
            "sourceId": raw.get("sourceId") or case_id,
            "sourcePopulation": raw.get("sourcePopulation") or "Exact-GT V2.1 frozen spatial perturbation corpus",
            "selectionRoles": raw.get("selectionRoles") or [],
            "perturbation": raw.get("perturbationType"),
            "perturbationType": raw.get("perturbationType"),
            "severity": raw.get("severity"),
            "severityValue": as_number(raw.get("severityValue")),
            "severityUnit": raw.get("severityUnit"),
            "parameters": raw.get("parameters") or {},
            "transform": raw.get("coordinateTransform"),
            "sourceHash": raw.get("originalSourceSha256") or raw.get("sourceSha256"),
            "originalGroundTruthHash": raw.get("originalGroundTruthSha256") or raw.get("originalSourceGTMaskSha256"),
            "transformedSourceHash": raw_frame.get("transformedSourceSha256") or media_hashes.get("transformedSourceSha256"),
            "gtHash": media_hashes.get("exactGtPupilMaskSha256") or media_hashes.get("exactGtSha256") or media_hashes.get("primaryGtSha256") or exact_gt.get("pupilMaskSha256") or exact_gt.get("sha256"),
            "gtNativeHash": exact_gt.get("sha256"),
            "gtPupilMaskHash": exact_gt.get("pupilMaskSha256"),
            "width": width,
            "height": height,
            "frames": [frame],
        })
    return cases


def build_temporal_visual_cases(
    manifest: dict[str, Any] | None,
    identity: dict[str, Any],
) -> list[dict[str, Any]]:
    """Validate and enrich bounded V2.2 media cases without deriving predictions."""
    if not manifest:
        return []
    expected_schema = "mouse-pupillometry-benchmark-temporal-media-export.v1"
    if manifest.get("schema") != expected_schema:
        raise ValueError(f"Unsupported temporal visual manifest schema: {manifest.get('schema')}")
    variant_by_method, family_map = get_identity_maps(identity)
    cases = []
    seen_case_ids: set[str] = set()
    expected_methods = set(TEMPORAL_VISUAL_METHOD_IDS)
    for raw_case in manifest.get("cases", []):
        case_id = str(raw_case.get("id") or "")
        if not case_id or case_id in seen_case_ids:
            raise ValueError("Temporal visual manifest has a missing or duplicate case ID.")
        seen_case_ids.add(case_id)
        raw_frames = raw_case.get("frames") or []
        if len(raw_frames) != 96:
            raise ValueError(f"Temporal visual case {case_id} must include all 96 frozen frames.")
        frames = []
        for expected_index, raw_frame in enumerate(raw_frames):
            frame_index = as_number(raw_frame.get("frameIndex"))
            if frame_index != expected_index:
                raise ValueError(f"Temporal visual case {case_id} has a non-contiguous frame order.")
            raw_reference = raw_frame.get("reference") or {}
            source_url = raw_frame.get("sourceSrc") or raw_reference.get("src")
            gt_url = raw_reference.get("gt")
            if not (isinstance(source_url, str) and source_url.startswith("/media/")):
                raise ValueError(f"Temporal visual case {case_id} has no local frozen source frame at {expected_index}.")
            if not (isinstance(gt_url, str) and gt_url.startswith("/media/")):
                raise ValueError(f"Temporal visual case {case_id} has no local GT frame at {expected_index}.")
            hashes = raw_frame.get("mediaHashes") or {}
            if not hashes.get("sourceSha256") or not (hashes.get("gtVisibleSha256") or hashes.get("gtLatentSha256")):
                raise ValueError(f"Temporal visual case {case_id} lacks source/GT media hashes at {expected_index}.")

            reference = dict(raw_reference)
            reference["src"] = source_url
            reference["image"] = source_url
            reference["gt"] = gt_url
            # The viewer promotes reference.geometry and otherwise drops its
            # sibling GT URL; preserve the actual mask URL on the geometry.
            geometry = dict(reference.get("geometry") or {})
            geometry["mask"] = {"src": gt_url}
            reference["geometry"] = geometry

            raw_methods = raw_frame.get("methods") or {}
            if set(raw_methods) != expected_methods:
                raise ValueError(f"Temporal visual case {case_id} must preserve all 11 method records at {expected_index}.")
            methods: dict[str, Any] = {}
            for method_id in TEMPORAL_VISUAL_METHOD_IDS:
                record = dict(raw_methods[method_id] or {})
                variant = variant_by_method.get(method_id, {})
                method_identity = method_base(
                    method_id,
                    variant_by_method,
                    family_map,
                    method_name=variant.get("label") or method_id.replace("_", " "),
                    representation=variant.get("representation"),
                    operating_point="V2.2 frozen temporal diameter_sine sequence",
                    canonical=True,
                )
                record.update(method_identity)
                record["methodId"] = method_id
                record["methodName"] = method_identity["methodName"]
                # The frontend normalizer merges the nested geometry into the
                # frame overlay and does not retain arbitrary outer fields.
                prediction_geometry = dict(record.get("geometry") or {})
                values = record.get("values") or {}
                prediction_geometry["residual"] = as_number(values.get("diameterResidualPx"))
                prediction_geometry["value"] = as_number(values.get("diameterTrajectoryPx"))
                for field in ("status", "unavailable", "unavailableReason", "predictionMask", "provenance"):
                    if field in record:
                        prediction_geometry[field] = record[field]
                prediction_geometry["accepted"] = record.get("accepted")
                prediction_geometry["confidence"] = record.get("confidence")
                prediction_geometry["rejectionReason"] = record.get("rejectionReason")
                record["geometry"] = prediction_geometry if prediction_geometry else None
                record["residual"] = as_number(values.get("diameterResidualPx"))
                methods[method_id] = record

            frames.append({
                "frameIndex": int(frame_index),
                "timestampMs": as_number(raw_frame.get("timestampMs")),
                "sourceFrameNumber": as_number(raw_frame.get("sourceFrameNumber")),
                "width": as_number(raw_frame.get("width")),
                "height": as_number(raw_frame.get("height")),
                "sourceSrc": source_url,
                "sourceId": raw_frame.get("sourceId") or raw_case.get("sourceId"),
                "perturbation": raw_frame.get("perturbation") or raw_case.get("perturbationType"),
                "reference": reference,
                "methods": methods,
                "mediaHashes": hashes,
            })
        cases.append({
            "id": case_id,
            "label": raw_case.get("label") or case_id,
            "mode": raw_case.get("mode") or ("representative" if raw_case.get("representative") else "conditional_example"),
            "representative": bool(raw_case.get("representative")),
            "outcomeSelected": bool(raw_case.get("outcomeSelected")),
            "category": "temporal",
            "sourceId": raw_case.get("sourceId"),
            "sourceHash": raw_case.get("sourceHash"),
            "seedId": raw_case.get("seedId"),
            "sequenceId": raw_case.get("sequenceId"),
            "perturbation": raw_case.get("perturbationType"),
            "perturbationType": raw_case.get("perturbationType"),
            "parameters": raw_case.get("parameters") or {},
            "sourcePopulation": raw_case.get("sourcePopulation"),
            "selectionPolicy": raw_case.get("selectionPolicy"),
            "sourceFreeze": raw_case.get("sourceFreeze"),
            "timebase": raw_case.get("timebase"),
            "diameterResidualDefinition": raw_case.get("diameterResidualDefinition"),
            "methodAvailability": raw_case.get("methodAvailability") or {},
            "frames": frames,
        })
    if not cases:
        raise ValueError("Temporal visual manifest contains no sequence cases.")
    return cases


def normalize_identity(identity: dict[str, Any], all_methods: dict[str, dict[str, Any]]) -> dict[str, Any]:
    variant_by_method, family_map = get_identity_maps(identity)
    selected_primary = set()
    for method_id, data in all_methods.items():
        if data.get("isCanonical"):
            selected_primary.add(method_id)
    variants = []
    for variant in identity.get("variants", []):
        method_id = str(variant.get("method_id", ""))
        is_canonical = method_id in selected_primary
        variants.append({
            "methodId": method_id,
            "id": method_id,
            "variantId": variant.get("variant_id"),
            "label": variant.get("label"),
            "family": variant.get("family_id"),
            "familyId": variant.get("family_id"),
            "color": variant.get("color"),
            "familyColor": variant.get("family_color"),
            "colorKey": method_id,
            "representation": variant.get("representation"),
            "nativeOrMatched": variant.get("native_or_matched"),
            "isCanonical": is_canonical,
            "canonical": is_canonical,
        })
    families = [{
        "familyId": f.get("family_id"), "id": f.get("family_id"),
        "label": f.get("label"), "familyBadge": f.get("family_badge"),
        "color": f.get("color"), "contrastText": f.get("contrast_text"),
    } for f in identity.get("families", [])]
    # Carry stable identity information for benchmark methods not represented by
    # the visual identity registry. Their color is the canonical family color.
    identity_ids = {v["methodId"] for v in variants}
    for method_id, extra in sorted(all_methods.items()):
        if method_id in identity_ids:
            continue
        identity_alias = variant_by_method.get(METHOD_IDENTITY_ALIASES.get(method_id, ""), {})
        family_id = str(identity_alias.get("family_id") or extra.get("family_id") or extra.get("family") or "unknown")
        family = family_map.get(family_id, {})
        variants.append({
            "methodId": method_id, "id": method_id, "variantId": method_id,
            "label": extra.get("label") or method_id.replace("_", " "),
            "family": family_id, "familyId": family_id,
            "color": identity_alias.get("color") or family.get("color"),
            "familyColor": identity_alias.get("family_color") or family.get("color"),
            "colorKey": method_id, "representation": extra.get("representation"),
            "nativeOrMatched": extra.get("native_or_matched"),
            "isCanonical": method_id in selected_primary, "canonical": method_id in selected_primary,
            "identityVariantId": identity_alias.get("variant_id") or None,
        })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "families": families,
        "variants": variants,
        "backendEncoding": identity.get("backend_encoding"),
        "precisionEncoding": identity.get("precision_encoding"),
        "familyColorIsPermanent": identity.get("family_color_is_permanent"),
        "colorIsNotSoleEncoding": identity.get("color_is_not_sole_encoding"),
        "sourceSchema": identity.get("schema"),
        "identityAliases": [
            {"methodId": method_id, "identityVariantId": variant_id, "aliasPolicy": "Uses canonical family color and shade; keeps the source table method ID as the exported ID."}
            for method_id, variant_id in sorted(METHOD_IDENTITY_ALIASES.items())
        ],
    }


def attach_version(cards: dict[str, list[dict[str, Any]]], version: str) -> None:
    for rows in cards.values():
        for card in rows:
            card["benchmarkVersion"] = version
            for method in card.get("methods", []):
                method.setdefault("canonical", bool(method.get("isCanonical", False)))
                method.setdefault("isCanonical", bool(method.get("canonical", False)))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def export_source_ref(path: str, sha256: str, *, row_id: str | None = None, kind: str = "canonical_row") -> dict[str, Any]:
    ref: dict[str, Any] = {"type": kind, "path": path, "sha256": sha256}
    if row_id:
        ref["rowId"] = row_id
    return ref


def display_method(method_id: str, label: str | None = None) -> str:
    if label:
        return label
    known = {
        "segformer_b0": "SegFormer B0", "segformer_b1": "SegFormer B1", "segformer_b2": "SegFormer B2",
        "unet_small": "U-Net small", "unet_base": "U-Net base", "unet_b2_matched": "U-Net B2-matched",
        "standard_dlc_matched": "Standard DLC", "pupil_dlc_gm": "Pupil-DLC General Model",
        "pupil_dlc_im": "Pupil-DLC Individual Model (session-adapted)",
        "dlc_zoo_mouse_pupil_vclose": "DLC Zoo", "neuropupil_animal": "NeuroPupil",
        "meye_released": "MEYE v0.1.1", "meye_matched": "MEYE matched",
        "classical_fixed": "Fixed ellipse", "mouse_pupil_analysis_v020": "mouse-pupil-analysis v0.2.0",
    }
    return known.get(method_id, method_id.replace("_", " "))


def build_overview_exports(
    *, real_summary: list[dict[str, str]], real_info: dict[str, Any], unet_rows: list[dict[str, str]],
    unet_info: dict[str, Any], runtime_rows: list[dict[str, str]], runtime_info: dict[str, Any],
    feature_atlas: dict[str, Any], feature_info: dict[str, Any], keypoint: dict[str, Any], keypoint_info: dict[str, Any],
    mpa_summary: dict[str, Any], mpa_summary_info: dict[str, Any], mpa_manifest_info: dict[str, Any], mpa_frame_info: dict[str, Any],
    execution_rows: list[dict[str, str]], temporal_data: dict[str, Any], temporal_completion: dict[str, Any], temporal_completion_info: dict[str, Any], fingerprint: str, version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Generate route-level values with hash-bound, typed canonical row references."""
    evidence_rows, _ = read_csv(REAL_EVIDENCE_PATH, "v2 registry source-row joins")
    evidence_by_key = {(r.get("plane"), r.get("method_id")): r for r in evidence_rows}
    feature_methods = {m.get("method_id"): m for card in feature_atlas.get("cards", []) for m in card.get("methods", []) if m.get("method_id")}
    aggregates = ((feature_atlas.get("feature_v10") or {}).get("aggregates") or {}).get("diameter_are", {})

    def feature_metric(method_id: str, card_id: str) -> Any:
        for card in feature_atlas.get("cards", []):
            if card.get("id") == card_id:
                return next((m.get("value") for m in card.get("methods", []) if m.get("method_id") == method_id), None)
        return None
    primary_plane = "shared_scalar_mask_gt"
    conditions: list[dict[str, Any]] = []
    primary_by_method: dict[str, dict[str, Any]] = {}

    def ref(info: dict[str, Any], row_id: str, kind: str) -> dict[str, Any]:
        return export_source_ref(info["path"], info["sha256"], row_id=row_id, kind=kind)

    for row in real_summary:
        method_id, plane = row.get("method_id", ""), row.get("plane", "")
        if not method_id or not plane:
            continue
        evidence = evidence_by_key.get((plane, method_id), {})
        row_id = row.get("evidence_id") or evidence.get("evidence_id") or f"{plane}:{method_id}:{row.get('condition')}"
        condition_id = f"{method_id}__{plane}__{row.get('condition') or 'unspecified'}__{row.get('representation') or 'unspecified'}"
        role = ROSTER_ROLE_BY_METHOD.get(method_id, "INTERNAL_CUSTOM")
        is_primary = plane == primary_plane and method_id in PUBLISHED_PRIMARY_METHOD_IDS
        are = as_number(row.get("family_macro_diameter_are"))
        atlas = aggregates.get(method_id, {})
        ci = atlas.get("grouped_ci95") or [None, None]
        cat_fraction = as_number(row.get("catastrophic_gt20_fraction_retained"))
        condition = {
            "conditionId": condition_id, "methodId": method_id,
            "label": display_method(method_id) if method_id == "pupil_dlc_im" else display_method(method_id, row.get("label")), "family": row.get("family_id") or None,
            "model": display_method(method_id) if method_id == "pupil_dlc_im" else display_method(method_id, row.get("label")), "representation": row.get("representation") or None,
            "operatingPoint": row.get("condition") or None, "plane": plane, "truthView": row.get("truth_view") or None,
            "coverage": as_number(row.get("coverage")), "coveragePercent": as_number(row.get("coverage")) * 100 if as_number(row.get("coverage")) is not None else None,
            "accepted": as_number(row.get("retained")), "attempted": as_number(row.get("attempted")),
            "familyCount": as_number(row.get("families_with_retained_diameter")),
            "metrics": {
                "diameterArePercent": are * 100 if are is not None else None,
                "diameterFamilyCi": {"lower": ci[0], "upper": ci[1]} if len(ci) == 2 and ci[0] is not None and ci[1] is not None else None,
                "gt20Count": None,
                "gt20FractionRetainedPercent": cat_fraction * 100 if cat_fraction is not None else None,
                "centerErrorPx": as_number(row.get("center_mae_px")),
                "dice": feature_metric(method_id, "feature-pupil-dice"),
            },
            "primary": bool(is_primary), "rosterRole": role,
            "sourceRefs": [ref(real_info["summary"], str(row_id), "real_validation_summary_row"), ref(real_info["evidence"], str(evidence.get("evidence_id") or row_id), "real_validation_evidence_row")],
            "sourceHashes": {"frameMetricsSha256": evidence.get("frame_metrics_sha256") or None, "validationManifestSha256": evidence.get("validation_manifest_sha256") or None},
        }
        if not is_primary:
            condition["controlType"] = "representation_variant" if plane != primary_plane else ("architecture_control" if role == "MATCHED_CONTROL" else "advanced_comparator")
        if evidence.get("frame_metrics_sha256"):
            # Hash of the source row's immutable scored plane; sufficient to bind the denominator.
            condition["frameMetricsSha256"] = evidence["frame_metrics_sha256"]
        conditions.append(condition)
        if plane == primary_plane:
            primary_by_method[method_id] = condition

    # The published mouse-pupil-analysis release has a separate official,
    # mapping-fixed source and is joined only through its manifest-bound run.
    mpa_feature = feature_methods.get("mouse_pupil_analysis_v020", {})
    mpa_are = (aggregates.get("mouse_pupil_analysis_v020") or {}).get("value")
    mpa_valid = as_number(mpa_summary.get("valid", mpa_summary.get("retained")))
    mpa_attempted = as_number(mpa_summary.get("attempted"))
    mpa_ci = (aggregates.get("mouse_pupil_analysis_v020") or {}).get("grouped_ci95") or [None, None]
    mpa = {
        "conditionId": "mouse_pupil_analysis_v020__official_mapping_fixed__mask", "methodId": "mouse_pupil_analysis_v020",
        "label": "mouse-pupil-analysis v0.2.0", "family": "mouse_pupil_analysis", "model": "mouse-pupil-analysis v0.2.0",
        "representation": mpa_feature.get("representation"), "operatingPoint": "official v0.2.0; mapping-fixed; native mapped pupil mask",
        "plane": "official_native_mask", "coverage": (mpa_valid / mpa_attempted) if mpa_valid is not None and mpa_attempted else None,
        "coveragePercent": (mpa_valid / mpa_attempted * 100) if mpa_valid is not None and mpa_attempted else None,
        "accepted": mpa_valid, "attempted": mpa_attempted, "familyCount": (aggregates.get("mouse_pupil_analysis_v020") or {}).get("families"),
        "metrics": {"diameterArePercent": mpa_are, "diameterFamilyCi": {"lower": mpa_ci[0], "upper": mpa_ci[1]} if len(mpa_ci) == 2 else None, "gt20Count": None, "gt20FractionRetainedPercent": None, "centerErrorPx": None, "dice": feature_metric("mouse_pupil_analysis_v020", "feature-pupil-dice")},
        "primary": True, "rosterRole": "PUBLISHED",
        "sourceRefs": [ref(mpa_summary_info, "mouse_pupil_analysis_v020", "official_method_summary"), ref(mpa_manifest_info, "RUN_MANIFEST", "official_run_manifest"), ref(feature_info, "feature_v10.aggregates.diameter_are.mouse_pupil_analysis_v020", "canonical_feature_aggregate"), ref(mpa_frame_info, "mouse_pupil_analysis_v020", "official_frame_metrics")],
        "sourceHashes": {"frameMetricsSha256": mpa_frame_info.get("sha256"), "validationManifestSha256": mpa_manifest_info.get("sha256")},
    }
    conditions.append(mpa)
    primary_by_method["mouse_pupil_analysis_v020"] = mpa

    # Add the three U-Net controls without elevating them into the default roster.
    unet_by_method = {str(r.get("method_id")): r for r in unet_rows}
    for method_id, row in unet_by_method.items():
        if method_id == "segformer_b2":
            condition = primary_by_method.get(method_id)
            if condition:
                condition["sourceRefs"].append(ref(unet_info, method_id, "architecture_control_row"))
                condition["architectureControl"] = {"coverage": as_number(row.get("coverage")), "diameterArePercent": (as_number(row.get("family_macro_diameter_are")) or 0) * 100}
            continue
        value, low, high = (as_number(row.get(k)) for k in ("family_macro_diameter_are", "family_bootstrap_ci95_low", "family_bootstrap_ci95_high"))
        coverage = as_number(row.get("coverage"))
        conditions.append({
            "conditionId": f"{method_id}__architecture_matched_validation", "methodId": method_id,
            "label": display_method(method_id), "family": "vanilla_unet", "model": display_method(method_id),
            "representation": "native mask + common geometry", "operatingPoint": "frozen corrected validation operating point",
            "plane": "matched_architecture_control", "coverage": coverage, "coveragePercent": coverage * 100 if coverage is not None else None,
            "accepted": as_number(row.get("retained")), "attempted": as_number(row.get("attempted")), "familyCount": as_number(row.get("family_count")),
            "metrics": {"diameterArePercent": value * 100 if value is not None else None, "diameterFamilyCi": {"lower": low * 100, "upper": high * 100} if low is not None and high is not None else None, "gt20Count": as_number(row.get("retained_catastrophic_gt20_count")), "gt20FractionRetainedPercent": as_number(row.get("retained_catastrophic_gt20_fraction")) * 100 if as_number(row.get("retained_catastrophic_gt20_fraction")) is not None else None, "centerErrorPx": as_number(row.get("retained_pupil_centroid_error_px_mean")), "dice": as_number(row.get("retained_pupil_dice_mean"))},
            "primary": False, "rosterRole": "MATCHED_CONTROL", "controlType": "architecture_control",
            "checkpointHash": row.get("selected_checkpoint_sha256") or None, "protocolHash": row.get("protocol_payload_sha256") or None,
            "sourceRefs": [ref(unet_info, method_id, "architecture_control_row")],
        })

    # Keypoint systems have precomputed prospective 95% coverage thresholds;
    # the exporter passes these source points through without interpolation.
    matched_by_method: dict[str, dict[str, Any]] = {}
    for method_id in ("standard_dlc_matched", "pupil_dlc_gm"):
        point = keypoint.get(method_id, {}).get("coverage_95")
        if not point:
            continue
        original = primary_by_method.get(method_id, {})
        evi = evidence_by_key.get((primary_plane, method_id), {})
        cond = {
            "conditionId": f"{method_id}__prospective_95pct_coverage", "methodId": method_id,
            "label": f"{display_method(method_id)} · ≥95% prospective coverage", "family": original.get("family"),
            "model": display_method(method_id), "representation": "unchanged native confidence-ranked geometry",
            "operatingPoint": f"confidence threshold {point.get('threshold')}; prospective ≥95% coverage", "plane": "prospective_coverage_matched",
        "coverage": as_number(point.get("coverage")), "coveragePercent": as_number(point.get("coverage")) * 100 if as_number(point.get("coverage")) is not None else None,
            "accepted": as_number(point.get("valid")), "attempted": as_number(point.get("attempted")),
            "familyCount": as_number(point.get("families_with_valid")),
            "metrics": {"diameterArePercent": as_number(point.get("family_macro_diameter_are")) * 100 if as_number(point.get("family_macro_diameter_are")) is not None else None, "diameterFamilyCi": None, "gt20Count": None, "gt20FractionRetainedPercent": None, "centerErrorPx": None, "dice": None},
            "primary": False, "rosterRole": "MATCHED_CONTROL", "controlType": "coverage_matched_operating_point",
            "sourceRefs": [ref(keypoint_info, f"{method_id}:coverage_95", "prospective_threshold_row"), ref(real_info["evidence"], evi.get("evidence_id") or method_id, "population_identity_evidence")],
            "sourceHashes": {"populationFrameMetricsSha256": evi.get("frame_metrics_sha256") or None},
        }
        conditions.append(cond)
        matched_by_method[method_id] = cond

    runtime_by_method = {str(r.get("model_id")): r for r in runtime_rows if r.get("model_id")}
    runtime_alias = {"unet_small_matched": "unet_small", "unet_base_matched": "unet_base", "unet_b2_matched": "unet_b2_matched"}
    runtime_by_method = {runtime_alias.get(k, k): v for k, v in runtime_by_method.items()}
    completion = runtime_info.get("completion") or {}
    speed_points: list[dict[str, Any]] = []
    catastrophic_rows: list[dict[str, Any]] = []
    for condition in conditions:
        metrics = condition.get("metrics") or {}
        cat = metrics.get("gt20FractionRetainedPercent")
        if cat is not None:
            catastrophic_rows.append({"id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": condition["methodId"], "label": condition["label"], "value": cat, "coveragePercent": condition.get("coveragePercent"), "primary": condition.get("primary"), "rosterRole": condition.get("rosterRole"), "sourceRefs": condition["sourceRefs"]})
        runtime = runtime_by_method.get(condition["methodId"])
        condition_matches_common_plane = condition.get("plane") in {primary_plane, "matched_architecture_control", "official_native_mask"}
        if not condition_matches_common_plane:
            condition["commonRuntime"] = (
                {"status": "METHOD_RUNTIME_NOT_JOINED_TO_CONDITION", "latencyMs": None, "reason": "A method runtime row exists, but this validation condition has a different representation or operating point and is not joined to the common A5000 accuracy plot."}
                if runtime is not None
                else {"status": "NOT_MEASURED_IN_COMMON_A5000_TOURNAMENT", "latencyMs": None, "reason": "No compatible method row is present in the verified common A5000 batch-one tournament."}
            )
            continue
        if runtime is None:
            condition["commonRuntime"] = {"status": "NOT_MEASURED_IN_COMMON_A5000_TOURNAMENT", "latencyMs": None, "reason": "No compatible method row is present in the verified common A5000 batch-one tournament."}
            continue
        latency = as_number(runtime.get("end_to_end_p50_ms"))
        error = metrics.get("diameterArePercent")
        runtime_ref = ref(runtime_info["csvInfo"], condition["methodId"], "common_a5000_runtime_row")
        if latency is None or error is None:
            condition["commonRuntime"] = {"status": "INCOMPLETE_COMMON_JOIN", "latencyMs": latency, "reason": "Runtime and compatible validation accuracy are not both available."}
            continue
        speed_points.append({
            "id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": condition["methodId"], "label": condition["label"],
            "latencyMs": latency, "accuracyPercent": error, "coveragePercent": condition.get("coveragePercent"),
            "accepted": condition.get("accepted"), "attempted": condition.get("attempted"), "family": condition.get("family"),
            "model": condition.get("model"), "representation": condition.get("representation"), "operatingPoint": condition.get("operatingPoint"),
            "runtimeProtocol": completion.get("protocol_sha256"), "sourceRefs": condition["sourceRefs"] + [runtime_ref],
            "comparable": True, "primary": condition.get("primary"), "rosterRole": condition.get("rosterRole"),
        })
        condition["commonRuntime"] = {"status": "COMMON_BATCH1_VALID", "latencyMs": latency, "runtimeProtocol": completion.get("protocol_sha256"), "sourceRefs": [runtime_ref]}

    accuracy_coverage: list[dict[str, Any]] = []
    practical: list[dict[str, Any]] = []
    for method_id, condition in primary_by_method.items():
        if not condition.get("primary"):
            continue
        are = (condition.get("metrics") or {}).get("diameterArePercent")
        if are is None:
            continue
        ci = (condition.get("metrics") or {}).get("diameterFamilyCi") or {}
        connection = f"{method_id}__coverage_operating_points" if method_id in matched_by_method else None
        accuracy_coverage.append({"id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": method_id, "label": condition["label"], "coveragePercent": condition.get("coveragePercent"), "accuracyPercent": are, "accuracyLowerPercent": ci.get("lower"), "accuracyUpperPercent": ci.get("upper"), "family": condition.get("family"), "familyCount": condition.get("familyCount"), "plane": condition.get("plane"), "model": condition.get("model"), "representation": condition.get("representation"), "operatingPoint": condition.get("operatingPoint"), "accepted": condition.get("accepted"), "attempted": condition.get("attempted"), "connectionId": connection, "sourceRefs": condition["sourceRefs"]})
        practical.append({"id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": method_id, "label": condition["label"], "value": are, "lower": ci.get("lower"), "upper": ci.get("upper"), "coveragePercent": condition.get("coveragePercent"), "reachesTarget": condition.get("coveragePercent") is not None and condition["coveragePercent"] >= 95, "sourceRefs": condition["sourceRefs"]})
    for method_id, condition in matched_by_method.items():
        are = (condition.get("metrics") or {}).get("diameterArePercent")
        if are is None:
            continue
        accuracy_coverage.append({"id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": method_id, "label": condition["label"], "coveragePercent": condition.get("coveragePercent"), "accuracyPercent": are, "accuracyLowerPercent": None, "accuracyUpperPercent": None, "family": condition.get("family"), "familyCount": condition.get("familyCount"), "plane": condition.get("plane"), "model": condition.get("model"), "representation": condition.get("representation"), "operatingPoint": condition.get("operatingPoint"), "accepted": condition.get("accepted"), "attempted": condition.get("attempted"), "connectionId": f"{method_id}__coverage_operating_points", "sourceRefs": condition["sourceRefs"]})
        practical.append({"id": condition["conditionId"], "conditionId": condition["conditionId"], "methodId": method_id, "label": condition["label"], "value": are, "lower": None, "upper": None, "coveragePercent": condition.get("coveragePercent"), "reachesTarget": condition.get("coveragePercent") is not None and condition["coveragePercent"] >= 95, "sourceRefs": condition["sourceRefs"]})

    paired = []
    for method_id, row in unet_by_method.items():
        delta = as_number(row.get("paired_family_macro_delta_vs_segformer_b2"))
        if delta is None:
            continue
        low, high = as_number(row.get("paired_family_bootstrap_ci95_low")), as_number(row.get("paired_family_bootstrap_ci95_high"))
        paired.append({"id": method_id, "label": display_method(method_id), "differencePercentagePoints": delta * 100, "ciLow": low * 100 if low is not None else None, "ciHigh": high * 100 if high is not None else None, "comparison": "paired acquisition-family macro diameter ARE difference vs SegFormer B2", "sourceRefs": [ref(unet_info, method_id, "paired_architecture_row")]})

    temporal_scope = str(temporal_completion.get("scope") or "")
    temporal_shape = re.search(r"(\d+) trajectories per seed,\s*(\d+) frames per trajectory", temporal_scope)
    temporal_seed_count = as_number(temporal_completion.get("seed_count"))
    temporal_sequences = as_number(temporal_completion.get("sequence_count"))
    population = {
        "acquisitionFamilyCount": max((as_number(r.get("families_attempted")) or 0 for r in real_summary if r.get("plane") == primary_plane), default=None),
        "validationFrameCount": max((as_number(r.get("attempted")) or 0 for r in real_summary if r.get("plane") == primary_plane), default=None),
        "exactGtCaseCount": sum(1 for row in execution_rows if row.get("kind") == "spatial"),
        "temporalSeedCount": temporal_seed_count,
        "temporalTrajectoryCount": temporal_sequences,
        "temporalTrajectoriesPerSeed": as_number(temporal_shape.group(1)) if temporal_shape else None,
        "temporalFramesPerTrajectory": as_number(temporal_shape.group(2)) if temporal_shape else None,
        "temporalTruthFrameCount": as_number(temporal_completion.get("rows_replayed")),
        "temporalObservedInputCount": as_number(temporal_completion.get("observed_inputs")),
        "temporalNoCallCount": as_number(temporal_completion.get("missing_inputs_confirmed_no_call")),
        "temporalMethodCount": (temporal_data.get("sourcePopulation") or {}).get("methodCount"),
        "temporalObservationCount": len(temporal_data.get("perSeedObservations", [])),
    }
    overview = {
        "schema": OVERVIEW_SCHEMA, "version": version,
        "status": {"label": "DEVELOPMENT", "externalEvaluation": "NOT_OPENED", "sourceFingerprintSha256": fingerprint},
        "population": population,
        "safety": {"allenModelScoring": as_number(temporal_completion.get("allen_model_scoring")), "legacyProtectedInferenceQueries": as_number(temporal_completion.get("legacy_protected_inference_queries")), "externalEvaluation": "NOT_OPENED"},
        "statements": [],
        "figures": {"accuracyCoverage": accuracy_coverage, "practicalCoverage": practical, "pairedArchitecture": paired, "commonSpeedAccuracy": speed_points, "catastrophicFailure": catastrophic_rows},
        "sourceRefs": [ref(real_info["summary"], "", "canonical_source_file"), ref(real_info["evidence"], "", "canonical_source_file"), ref(unet_info, "", "canonical_source_file"), ref(runtime_info["csvInfo"], "", "canonical_source_file"), ref(feature_info, "", "canonical_source_file"), ref(keypoint_info, "", "canonical_source_file"), ref(temporal_completion_info, "", "canonical_source_file")],
    }
    registry = {
        "schema": REAL_VALIDATION_REGISTRY_SCHEMA, "version": version, "status": "DEVELOPMENT",
        "population": population, "conditions": conditions,
        "metricDefinitions": {
            "diameterArePercent": {"label": "Family-macro diameter absolute relative error", "unit": "%", "direction": "lower", "aggregation": "unweighted acquisition-family means"},
            "gt20FractionRetainedPercent": {"label": "Retained frames with diameter ARE >20%", "unit": "%", "direction": "lower", "denominator": "retained frames"},
        },
        "rosterRoles": ["PUBLISHED", "MATCHED_CONTROL", "INTERNAL_CUSTOM", "DEPLOYMENT_VARIANT", "NATIVE_WORKFLOW_ONLY", "BLOCKED"],
        "sourceFingerprintSha256": fingerprint,
    }
    return overview, registry


EXACT_GT_SEVERITY_METHODS = (
    "segformer_b2", "mouse_pupil_analysis_v020", "meye_released",
    "standard_dlc_matched", "unet_b2_matched",
)


def build_exact_gt_severity_rows(
    execution_rows: list[dict[str, str]], execution_rows_info: dict[str, Any],
    frame_rows_by_method: dict[str, dict[str, dict[str, str]]], frame_metric_sources: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Group frozen per-frame scores by source-defined operation severity.

    Each cell is the unweighted mean of measured, accepted frame-level diameter
    ARE values. This is a deterministic grouping of canonical score rows; it
    does not infer scores from the frozen visual example assets or compute a CI.
    """
    spatial = [row for row in execution_rows if row.get("kind") == "spatial"]
    cases_by_key: dict[str, dict[str, Any]] = {}
    for row in spatial:
        case_id = str(row.get("execution_id") or "")
        if not case_id or case_id in cases_by_key:
            raise ValueError("Exact-GT spatial execution rows must have unique non-empty IDs for severity grouping.")
        family = str(row.get("operation_family") or "")
        operation = json.loads(row.get("operation_json") or "{}")
        if operation.get("family") != family:
            raise ValueError(f"Exact-GT operation family disagrees with operation_json for {case_id}.")
        if family == "motion_blur":
            severity_field = "kernel_length_px"
        elif family == "latent_occlusion":
            severity_field = "visible_fraction"
        elif family == "crop_truncation":
            severity_field = "target_visible_fraction"
        elif family == "combined_pupil":
            severity_field = "categorical_condition"
        else:
            raise ValueError(f"Unrecognized frozen Exact-GT operation family for severity grouping: {family}")
        severity = "single" if severity_field == "categorical_condition" else operation.get(severity_field)
        if severity is None:
            raise ValueError(f"Canonical Exact-GT severity field {severity_field} is missing for {case_id}.")
        cases_by_key[case_id] = {"caseId": case_id, "operationFamily": family, "severity": severity, "severityField": severity_field, "operation": operation, "groundTruthSha256": row.get("primary_gt_sha256")}
    if len(cases_by_key) != 252:
        raise ValueError(f"Severity table expects the 252 frozen spatial cases; found {len(cases_by_key)}.")

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for case in cases_by_key.values():
        groups[(case["operationFamily"], str(case["severity"]))].append(case)
    rows: list[dict[str, Any]] = []
    source_ref_map: dict[str, dict[str, Any]] = {}
    for method_id in EXACT_GT_SEVERITY_METHODS:
        method_rows = frame_rows_by_method.get(method_id)
        source_info = frame_metric_sources.get(method_id)
        if method_rows is None or source_info is None:
            raise ValueError(f"Selected Exact-GT severity method lacks a canonical frame table: {method_id}")
        source_ref_map[method_id] = export_source_ref(source_info["path"], source_info["sha256"], kind="exact_gt_frame_metric_source")
        if not set(cases_by_key).issubset(method_rows):
            raise ValueError(f"{method_id} Exact-GT frame rows do not cover all 252 frozen spatial execution IDs.")
        for (operation_family, severity), cases in sorted(groups.items(), key=lambda item: (item[0][0], float(item[0][1]) if re.fullmatch(r"-?\d+(?:\.\d+)?", item[0][1]) else item[0][1])):
            values: list[float] = []
            case_ids: list[str] = []
            for case in cases:
                case_id = case["caseId"]
                row = method_rows[case_id]
                row_family = str(row.get("operation_family") or operation_family)
                if row_family != operation_family:
                    raise ValueError(f"{method_id} operation family mismatch at Exact-GT case {case_id}.")
                row_gt = row.get("primary_gt_sha256") or row.get("gt_mask_sha256")
                # The GT hash is checked by joining the scored row to its
                # source execution identity; field names vary by runner.
                exec_gt = case.get("groundTruthSha256")
                if row_gt and exec_gt and row_gt.lower() != exec_gt.lower():
                    raise ValueError(f"{method_id} GT hash differs from the frozen execution row for {case_id}.")
                case_ids.append(case_id)
                valid = str(row.get("valid") or "").strip().lower() in {"true", "1", "yes"}
                value = as_number(row.get("diameter_are"))
                if valid and value is not None:
                    values.append(value)
            attempted = len(cases)
            accepted = len(values)
            mean_are = sum(values) / accepted if accepted else None
            severity_source_value = cases[0]["severity"]
            if cases[0]["severityField"] == "kernel_length_px":
                severity_label = f"{severity_source_value} px"
            elif cases[0]["severityField"] == "visible_fraction":
                severity_label = f"{float(severity_source_value) * 100:g}% visible"
            elif cases[0]["severityField"] == "target_visible_fraction":
                severity_label = f"{float(severity_source_value) * 100:g}% target visible"
            else:
                severity_label = "compound transform"
            id_parts = [method_id, operation_family, severity.replace(".", "p")]
            rows.append({
                "id": "__".join(id_parts), "methodId": method_id, "method": display_method(method_id),
                "operationFamily": operation_family, "transform": operation_family,
                "severity": severity_source_value, "severityValue": severity_source_value, "severityLabel": severity_label,
                "severityField": cases[0]["severityField"],
                "metric": "diameter_are", "metricId": "diameter_are", "unit": "%",
                "value": mean_are * 100 if mean_are is not None else None,
                "valuePercent": mean_are * 100 if mean_are is not None else None,
                "accepted": accepted, "attempted": attempted,
                "coverage": accepted / attempted if attempted else None,
                "caseIds": case_ids,
                "status": "MEASURED" if mean_are is not None else "NOT_MEASURED",
                "aggregation": "mean of accepted frame-level diameter_are values within this frozen operation-family × severity cell; no CI computed",
                "sourceRefs": [source_ref_map[method_id], export_source_ref(execution_rows_info["path"], execution_rows_info["sha256"], row_id=f"{operation_family}:{severity}", kind="exact_gt_execution_case_group")],
            })
    metadata = {
        "schema": "mouse-pupillometry-exact-gt-severity.v2",
        "metric": "diameter_are", "unit": "%", "caseCount": len(cases_by_key),
        "operationFamilies": sorted({row["operationFamily"] for row in cases_by_key.values()}),
        "methodIds": list(EXACT_GT_SEVERITY_METHODS),
        "selectionPolicy": "SegFormer B2 headline; published mouse-pupil-analysis, released MEYE, Standard DLC; one B2-matched U-Net architecture control.",
        "severityPolicy": {
            "motion_blur": "kernel_length_px; 5 and 9 px",
            "latent_occlusion": "visible_fraction; source levels retained",
            "crop_truncation": "target_visible_fraction; edge directions pooled within level and attempted counts retained",
            "combined_pupil": "one categorical compound transform, not an ordinal severity",
        },
        "aggregationPolicy": "Mean of measured accepted per-frame diameter ARE rows within each source-defined cell. Rejected/missing rows remain in attempted denominator. Uncertainty intervals are not computed.",
        "sourceRefs": [export_source_ref(execution_rows_info["path"], execution_rows_info["sha256"], kind="canonical_exact_gt_execution_rows")] + list(source_ref_map.values()),
        "rows": rows,
    }
    return rows, metadata


def build_native_cpu_runtime_export(
    rows: list[dict[str, str]], csv_info: dict[str, Any], verification: dict[str, Any], verification_info: dict[str, Any],
) -> dict[str, Any]:
    expected_sha = str((verification.get("table") or {}).get("sha256") or "").lower()
    if expected_sha != str(csv_info.get("sha256") or "").lower():
        raise ValueError("Controlled native CPU runtime table hash does not match its verification report.")
    expected_methods = set(verification.get("methods", []))
    methods = {str(row.get("method_id") or "") for row in rows}
    if verification.get("status") != "PASS" or len(rows) != as_number(verification.get("method_count")) or methods != expected_methods:
        raise ValueError("Controlled native CPU runtime population does not match the passing verification report.")
    hardware = verification.get("shared_hardware") or {}
    batch_sizes = [int(match.group(1)) for row in rows if (match := re.search(r"/batch(\d+)$", str(row.get("condition_id") or "")))]
    if len(batch_sizes) != len(rows) or set(batch_sizes) != {1} or as_number(verification.get("shared_stream_samples")) is None:
        raise ValueError("Controlled native CPU runtime rows must share the verified batch-one corpus protocol.")
    output_rows: list[dict[str, Any]] = []
    for row in rows:
        method_id = str(row["method_id"])
        output_rows.append({
            "conditionId": row.get("condition_id"), "methodId": method_id, "method": display_method(method_id),
            "rosterRole": "NATIVE_WORKFLOW_ONLY", "hardware": hardware, "batchSize": 1,
            "corpusSampleCount": as_number(verification.get("shared_stream_samples")),
            "sharedStreamIdentitySha256": verification.get("shared_stream_identity_sha256"),
            "latencyMs": as_number(row.get("end_to_end_p50_ms")),
            "endToEndP50Ms": as_number(row.get("end_to_end_p50_ms")),
            "endToEndP95Ms": as_number(row.get("end_to_end_p95_ms")),
            "endToEndP99Ms": as_number(row.get("end_to_end_p99_ms")),
            "endToEndFps": as_number(row.get("end_to_end_fps")),
            "sustainedEndToEndFps": as_number(row.get("sustained_end_to_end_fps")),
            "inferenceFps": as_number(row.get("inference_fps")),
            "initializationMs": as_number(row.get("initialization_ms")),
            "ramPeakDeltaBytes": as_number(row.get("ram_peak_delta_bytes")),
            "checkpointOrEngineBytes": as_number(row.get("checkpoint_or_engine_bytes")),
            "nativeParityMode": row.get("native_parity_mode"),
            "statefulCondition": row.get("stateful_condition"),
            "stageP50Ms": {key: as_number(row.get(key)) for key in (
                "preprocessing_p50_ms", "host_to_device_transfer_p50_ms", "model_or_algorithm_p50_ms",
                "postprocessing_p50_ms", "geometry_extraction_p50_ms", "confidence_validity_p50_ms",
            )},
            "protocol": "Controlled CPU/native workflow timing; batch-one, shared frozen 14-sample stream. Separate from common CUDA A5000 timing.",
            "sourceRefs": [
                export_source_ref(csv_info["path"], csv_info["sha256"], row_id=method_id, kind="controlled_native_cpu_runtime_row"),
                export_source_ref(verification_info["path"], verification_info["sha256"], row_id=method_id, kind="runtime_population_verification"),
            ],
        })
    return {
        "schema": "mouse-pupillometry-native-cpu-runtime.v2",
        "status": "VERIFIED_SEPARATE_NATIVE_WORKFLOW_COMPARISON",
        "comparableToCommonA5000": False,
        "hardware": hardware,
        "sharedStreamSamples": as_number(verification.get("shared_stream_samples")),
        "sharedStreamIdentitySha256": verification.get("shared_stream_identity_sha256"),
        "notes": verification.get("notes"),
        "safety": verification.get("protected_counters"),
        "conditions": output_rows,
        "excludedMethods": [
            {"methodId": method_id, "status": "NATIVE_RUNTIME_NOT_MEASURED_IN_THIS_POPULATION", "reason": "No row is present in the verified eight-method native CPU population."}
            for method_id in (
                "facemap_raw", "facemap_processed", "eyeloop", "pupil_dlc_gm", "standard_dlc_matched",
                "dlc_zoo_mouse_pupil_vclose", "neuropupil_animal", "segformer_b0", "segformer_b1", "segformer_b2",
                "unet_small", "unet_base", "unet_b2_matched", "meye_released", "meye_matched",
            )
        ],
        "sourceRefs": [
            export_source_ref(csv_info["path"], csv_info["sha256"], kind="canonical_runtime_population_csv"),
            export_source_ref(verification_info["path"], verification_info["sha256"], kind="canonical_runtime_population_verification"),
        ],
    }


def _walk_strings(value: Any):
    if isinstance(value, dict):
        for child in value.values():
            yield from _walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_strings(child)
    elif isinstance(value, str):
        yield value


def verify_output(output_dir: Path = DEFAULT_OUT, *, verify_canonical_inputs: bool = True) -> dict[str, Any]:
    required = {
        "benchmark_manifest.json", "methods.json", "real_validation.json", "geometry.json",
        "segmentation.json", "coverage_risk.json", "exact_gt.json", "temporal.json",
        "runtime.json", "deployment.json", "capabilities.json", "provenance.json", "visual_cases.json",
        "WEBSITE_VISUAL_CASES.json", "overview_v2.json", "real_validation_v2.json", "visual_case_index_v2.json", "exact_gt_severity_v2.json", "native_cpu_runtime_v2.json",
    }
    if not output_dir.is_dir():
        raise FileNotFoundError(f"Export directory does not exist: {output_dir}")
    missing = sorted(name for name in required if not (output_dir / name).is_file())
    if missing:
        raise ValueError(f"Missing required export files: {missing}")

    manifest = json.loads((output_dir / "benchmark_manifest.json").read_text(encoding="utf-8"))
    provenance = json.loads((output_dir / "provenance.json").read_text(encoding="utf-8"))
    visual = json.loads((output_dir / "visual_cases.json").read_text(encoding="utf-8"))
    website_visual = json.loads((output_dir / "WEBSITE_VISUAL_CASES.json").read_text(encoding="utf-8"))
    overview = json.loads((output_dir / "overview_v2.json").read_text(encoding="utf-8"))
    real_validation_v2 = json.loads((output_dir / "real_validation_v2.json").read_text(encoding="utf-8"))
    split_index = json.loads((output_dir / "visual_case_index_v2.json").read_text(encoding="utf-8"))
    exact_severity = json.loads((output_dir / "exact_gt_severity_v2.json").read_text(encoding="utf-8"))
    native_cpu_runtime = json.loads((output_dir / "native_cpu_runtime_v2.json").read_text(encoding="utf-8"))
    if manifest.get("externalEvaluation") != "NOT_OPENED":
        raise ValueError("Export must remain development-labeled with external evaluation not opened.")
    if manifest.get("status") != "DEVELOPMENT":
        raise ValueError("Export status is not DEVELOPMENT.")
    if manifest.get("schemaVersion") != SCHEMA_VERSION or overview.get("schema") != OVERVIEW_SCHEMA or real_validation_v2.get("schema") != REAL_VALIDATION_REGISTRY_SCHEMA or split_index.get("schema") != VISUAL_CASE_INDEX_SCHEMA:
        raise ValueError("A v2 route-level export has an unexpected schema version.")

    # Verify every exported data file against its content hash and every input
    # against the canonical hash read at export time.
    for name, expected in manifest.get("files", {}).items():
        path = output_dir / name
        if not path.is_file():
            raise ValueError(f"Manifest references a missing output file: {name}")
        actual = sha256_file(path)
        if actual != expected.get("sha256"):
            raise ValueError(f"Export hash mismatch for {name}")
        if path.stat().st_size != expected.get("sizeBytes"):
            raise ValueError(f"Export size mismatch for {name}")
    input_entries = provenance.get("inputs", [])
    for entry in input_entries:
        relative = str(entry.get("path") or "")
        path_parts = PurePosixPath(relative).parts
        if not relative or PurePosixPath(relative).is_absolute() or any(part.lower() in {"allen", "protected", "external_gold"} for part in path_parts):
            raise ValueError(f"Unsafe canonical input reference in provenance: {relative}")
        if verify_canonical_inputs:
            candidate = input_path(relative)
            if sha256_file(candidate) != entry.get("sha256"):
                raise ValueError(f"Canonical input changed since export: {relative}")
    fingerprint_payload = json.dumps(
        [{"path": entry.get("path"), "sha256": entry.get("sha256")} for entry in sorted(input_entries, key=lambda item: str(item.get("path") or ""))],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    computed_fingerprint = hashlib.sha256(fingerprint_payload).hexdigest()
    if computed_fingerprint != manifest.get("sourceFingerprintSha256"):
        raise ValueError("Manifest source fingerprint does not match provenance inputs.")
    expected_version = f"benchmark-data-dev-v2+{computed_fingerprint[:16]}"
    if manifest.get("version") != expected_version or provenance.get("version") != expected_version:
        raise ValueError("Version string does not match the manifest source fingerprint.")

    data_json = [p for p in output_dir.glob("*.json") if p.name != "benchmark_manifest.json"]
    case_ids = [str(case.get("id")) for case in visual.get("cases", []) if case.get("id")]
    if len(case_ids) != len(set(case_ids)):
        raise ValueError("visual_cases.json has duplicate case IDs.")
    case_id_set = set(case_ids)
    case_by_id = {str(case.get("id")): case for case in visual.get("cases", []) if case.get("id")}
    if len(case_ids) != manifest.get("visualCaseCount"):
        raise ValueError("Manifest visual case count does not match visual_cases.json.")
    split_cases = split_index.get("cases", [])
    if len(split_cases) != len(case_by_id) or {str(row.get("id")) for row in split_cases} != set(case_by_id):
        raise ValueError("The split visual case index must preserve every full visual case ID exactly once.")
    for row in split_cases:
        case_id = str(row.get("id") or "")
        file_name = str(row.get("file") or "")
        if not file_name.startswith("cases/") or ".." in PurePosixPath(file_name).parts:
            raise ValueError(f"Unsafe split visual case file reference for {case_id}.")
        case_path = output_dir / file_name
        if not case_path.is_file():
            raise ValueError(f"Split visual case file is missing for {case_id}: {file_name}")
        split_case = json.loads(case_path.read_text(encoding="utf-8")).get("case")
        if split_case != case_by_id.get(case_id):
            raise ValueError(f"Split visual case content differs from full visual_cases.json for {case_id}.")
    if len(overview.get("figures", {}).get("accuracyCoverage", [])) > 40 or (output_dir / "overview_v2.json").stat().st_size >= 100_000:
        raise ValueError("Overview route export exceeds its compact payload contract.")
    if overview.get("safety", {}).get("allenModelScoring") != 0 or overview.get("safety", {}).get("legacyProtectedInferenceQueries") != 0:
        raise ValueError("Overview safety counters must be copied from source and remain zero.")
    conditions = real_validation_v2.get("conditions", [])
    condition_ids = [str(row.get("conditionId") or "") for row in conditions]
    if not conditions or len(condition_ids) != len(set(condition_ids)) or not all(isinstance(row.get("primary"), bool) for row in conditions):
        raise ValueError("The unified validation registry must have unique condition IDs and explicit primary booleans.")
    for row in conditions:
        for source_ref in row.get("sourceRefs", []):
            if not source_ref.get("path") or not source_ref.get("sha256") or not source_ref.get("type"):
                raise ValueError(f"Registry source reference is not fully typed and hashed: {row.get('conditionId')}")
    for figure_name in ("accuracyCoverage", "practicalCoverage", "commonSpeedAccuracy", "pairedArchitecture"):
        for point in overview.get("figures", {}).get(figure_name, []):
            for source_ref in point.get("sourceRefs", []):
                if not source_ref.get("path") or not source_ref.get("sha256") or not source_ref.get("type"):
                    raise ValueError(f"Overview {figure_name} contains an untyped or unhashed source reference.")
    severity_rows = exact_severity.get("rows", [])
    severity_keys = [(row.get("methodId"), row.get("operationFamily"), str(row.get("severity"))) for row in severity_rows]
    if exact_severity.get("schema") != "mouse-pupillometry-exact-gt-severity.v2" or len(severity_rows) != len(EXACT_GT_SEVERITY_METHODS) * 9 or len(severity_keys) != len(set(severity_keys)):
        raise ValueError("Quantitative Exact-GT severity export must preserve each selected method × frozen severity cell exactly once.")
    for method_id in EXACT_GT_SEVERITY_METHODS:
        method_cells = [row for row in severity_rows if row.get("methodId") == method_id]
        if sum(int(row.get("attempted") or 0) for row in method_cells) != 252:
            raise ValueError(f"Exact-GT severity cells do not preserve the full attempted denominator for {method_id}.")
        for row in method_cells:
            if int(row.get("accepted") or 0) > int(row.get("attempted") or 0) or len(row.get("caseIds", [])) != row.get("attempted"):
                raise ValueError(f"Exact-GT severity row has inconsistent accepted/attempted counts: {row.get('id')}")
            for source_ref in row.get("sourceRefs", []):
                if not source_ref.get("path") or not source_ref.get("sha256") or not source_ref.get("type"):
                    raise ValueError(f"Exact-GT severity source reference is incomplete: {row.get('id')}")
    native_conditions = native_cpu_runtime.get("conditions", [])
    if (native_cpu_runtime.get("schema") != "mouse-pupillometry-native-cpu-runtime.v2"
            or native_cpu_runtime.get("comparableToCommonA5000") is not False
            or len(native_conditions) != 8
            or native_cpu_runtime.get("safety", {}).get("allen_model_scoring") != 0
            or native_cpu_runtime.get("safety", {}).get("legacy_protected_inference_queries") != 0):
        raise ValueError("Separate native CPU runtime population is missing, mixed with A5000, or fails its safety/status contract.")
    for condition in native_conditions:
        if condition.get("batchSize") != 1 or condition.get("corpusSampleCount") != native_cpu_runtime.get("sharedStreamSamples") or condition.get("latencyMs") is None:
            raise ValueError(f"Native CPU runtime condition has an inconsistent shared protocol: {condition.get('conditionId')}")
        for source_ref in condition.get("sourceRefs", []):
            if not source_ref.get("path") or not source_ref.get("sha256") or not source_ref.get("type"):
                raise ValueError(f"Native CPU runtime source reference is incomplete: {condition.get('conditionId')}")
    target_cards = [card for path in data_json if (data := json.loads(path.read_text(encoding="utf-8"))) for card in data.get("cards", []) if card.get("direction") == "target"]
    if any(card.get("targetValue") != (1 if "gain" in str(card.get("id", "")).lower() else 0) for card in target_cards):
        raise ValueError("Every target-direction card must carry its explicit canonical targetValue.")
    website_cases = website_visual.get("cases", [])
    website_by_id = {str(case.get("id")): case for case in website_cases if case.get("id")}
    real_case_by_id = {key: case for key, case in case_by_id.items() if case.get("category") == "real_validation"}
    if website_visual.get("schema") != "WEBSITE_VISUAL_CASES_V1" or set(website_by_id) != set(real_case_by_id):
        raise ValueError("WEBSITE_VISUAL_CASES.json must index exactly the exported real-validation visual cases.")
    representative_count = sum(bool(case.get("representative")) and not bool(case.get("outcomeSelected")) for case in website_cases)
    outcome_selected_count = sum(bool(case.get("outcomeSelected")) for case in website_cases)
    if representative_count != 21 or outcome_selected_count != 10 or representative_count + outcome_selected_count != len(website_cases):
        raise ValueError("WEBSITE_VISUAL_CASES.json must preserve the 21 prediction-blind representatives and 10 outcome-selected cases.")
    for case_id, index_case in website_by_id.items():
        visual_case = real_case_by_id[case_id]
        index_frames = index_case.get("frames", [])
        visual_frames = visual_case.get("frames", [])
        if len(index_frames) != len(visual_frames):
            raise ValueError(f"WEBSITE_VISUAL_CASES frame count differs from visual_cases.json for {case_id}.")
        for index_frame, visual_frame in zip(index_frames, visual_frames):
            index_source = index_frame.get("source") or {}
            index_gt = index_frame.get("groundTruth") or {}
            reference = visual_frame.get("reference") or {}
            hashes = visual_frame.get("mediaHashes") or {}
            source_sha = hashes.get("sourceScoredRoiSha256") or hashes.get("transformedSourceSha256")
            gt_sha = hashes.get("gtScoredRoiSha256") or hashes.get("exactGtSha256") or hashes.get("primaryGtSha256")
            if (index_source.get("src") != visual_frame.get("sourceSrc")
                    or index_source.get("sha256") != source_sha
                    or index_gt.get("src") != reference.get("gt")
                    or index_gt.get("sha256") != gt_sha):
                raise ValueError(f"WEBSITE_VISUAL_CASES source/GT hash join differs from visual_cases.json for {case_id}.")
    for path in data_json:
        data = json.loads(path.read_text(encoding="utf-8"))
        for card in data.get("cards", []):
            card_id = str(card.get("id") or "")
            if not card_id:
                raise ValueError(f"A card in {path.name} has no id.")
            for case_id in card.get("visualCaseIds", []) or []:
                if case_id not in case_id_set:
                    raise ValueError(f"Card {card_id} references missing visual case {case_id}")
                expected_categories = {
                    "real_validation": {"real_validation"}, "geometry": {"real_validation"},
                    "segmentation": {"real_validation"}, "coverage_risk": {"real_validation"},
                    "exact_gt": {"exact_gt"}, "temporal": {"temporal"},
                    "runtime": {"runtime"}, "deployment": {"deployment"},
                }
                required_category = expected_categories.get(str(card.get("category")))
                actual_category = str(case_by_id[case_id].get("category") or "")
                if required_category and actual_category not in required_category:
                    raise ValueError(f"Card {card_id} references {actual_category} case {case_id}, expected {sorted(required_category)}")

    broken_assets = []
    media_hash_mismatches = []
    absolute_paths = []
    public_root = output_dir.resolve().parent if output_dir.resolve().parent.name == "public" else SITE_ROOT / "public"
    expected_media_hashes: dict[str, str] = {}
    for case in visual.get("cases", []):
        for frame in case.get("frames", []):
            hashes = frame.get("mediaHashes") or {}
            reference = frame.get("reference") or {}
            refs = [
                (frame.get("sourceSrc") or reference.get("src"), hashes.get("transformedSourceSha256") or hashes.get("sourceScoredRoiSha256") or hashes.get("sourceSha256")),
                (frame.get("originalSourceSrc"), hashes.get("originalSourceSha256")),
                (reference.get("gt"), hashes.get("exactGtPupilMaskSha256") or hashes.get("exactGtSha256") or hashes.get("gtScoredRoiSha256") or hashes.get("gtVisibleSha256") or hashes.get("gtLatentSha256")),
            ]
            reference_mask = reference.get("mask")
            if isinstance(reference_mask, dict):
                refs.append((
                    reference_mask.get("src") or reference_mask.get("url"),
                    reference_mask.get("sha256") or hashes.get("binaryPupilGtSha256") or reference.get("pupilMaskSha256") or reference.get("gtSha256"),
                ))
            for record in (frame.get("methods") or {}).values():
                mask = record.get("predictionMask") if isinstance(record, dict) else None
                if isinstance(mask, dict):
                    mask_url = mask.get("src") or mask.get("url")
                    mask_hash = mask.get("sha256") or record.get("predictionMaskSha256") or record.get("maskSha256")
                else:
                    mask_url = mask if isinstance(mask, str) else None
                    provenance = record.get("provenance") or {} if isinstance(record, dict) else {}
                    mask_hash = (record.get("predictionMaskSha256") or record.get("maskSha256") or provenance.get("predictionMaskSha256") or provenance.get("maskSha256")) if isinstance(record, dict) else None
                refs.append((mask_url, mask_hash))
                comparison = record.get("maskComparison") if isinstance(record, dict) else None
                if isinstance(comparison, dict):
                    refs.append((comparison.get("src"), comparison.get("sha256")))
            for url, expected_hash in refs:
                if isinstance(url, str) and url.startswith("/media/") and expected_hash:
                    prior = expected_media_hashes.setdefault(url, str(expected_hash).lower())
                    if prior != str(expected_hash).lower():
                        media_hash_mismatches.append(url)
    for path in data_json:
        data = json.loads(path.read_text(encoding="utf-8"))
        for value in _walk_strings(data):
            if value.startswith("/media/"):
                asset = public_root / value.lstrip("/")
                if not asset.is_file():
                    broken_assets.append(value)
                elif value in expected_media_hashes and sha256_file(asset) != expected_media_hashes[value]:
                    media_hash_mismatches.append(value)
            elif value.startswith(("/Users/", "/home/", "/private/")):
                absolute_paths.append(value)
    if broken_assets:
        raise ValueError(f"Broken local media references: {sorted(set(broken_assets))[:10]}")
    if absolute_paths:
        raise ValueError(f"Absolute local paths leaked into exported JSON: {sorted(set(absolute_paths))[:10]}")
    if media_hash_mismatches:
        raise ValueError(f"Local media hash mismatch: {sorted(set(media_hash_mismatches))[:10]}")

    cards_by_category = {}
    for name in ["real_validation", "geometry", "segmentation", "coverage_risk", "exact_gt", "temporal", "runtime", "deployment", "capabilities"]:
        file = output_dir / f"{name}.json"
        cards_by_category[name] = len(json.loads(file.read_text(encoding="utf-8")).get("cards", []))
    total_cards = sum(cards_by_category.values())
    if total_cards != manifest.get("cardCount"):
        raise ValueError("Manifest card count does not match exported category files.")
    if cards_by_category.get("real_validation", 0) == 0:
        raise ValueError("Real-validation section has no metric cards.")
    if cards_by_category.get("exact_gt", 0) == 0:
        raise ValueError("Exact-GT section has no metric cards.")
    quantitative_cards = total_cards - cards_by_category.get("capabilities", 0)
    if quantitative_cards < 40:
        raise ValueError(f"Only {quantitative_cards} non-capability metric cards were exported.")

    deployment = json.loads((output_dir / "deployment.json").read_text(encoding="utf-8"))
    deployment_conditions = deployment.get("cards", [{}])[0].get("methods", []) if deployment.get("cards") else []
    if len(deployment_conditions) != 30 or len({r.get("methodId") for r in deployment_conditions}) != len(deployment_conditions):
        raise ValueError("Deployment export must preserve all 30 unique model/runtime conditions.")
    int8_failed = [r for r in deployment_conditions if r.get("quantization") and "int8" in str(r.get("quantization")).lower() and r.get("status") == "FAIL COVERAGE"]
    if len(int8_failed) != 3:
        raise ValueError("All three executed INT8 model conditions must remain visible as FAIL COVERAGE.")

    capability_doc = json.loads((output_dir / "capabilities.json").read_text(encoding="utf-8"))
    capabilities = capability_doc.get("matrix", [])
    if not capabilities:
        raise ValueError("Capability matrix is empty.")
    if any(not capability.get("methods") for capability in capabilities):
        raise ValueError("A capability definition has no method status rows.")

    coverage_risk_doc = json.loads((output_dir / "coverage_risk.json").read_text(encoding="utf-8"))
    risk_cards = [card for card in coverage_risk_doc.get("cards", []) if card.get("overlayType") == "risk"]
    if len(risk_cards) != 1 or risk_cards[0].get("id") != "real-validation-risk-coverage":
        raise ValueError("Coverage/risk export must include exactly one explicit risk-coverage card.")
    risk_card = risk_cards[0]
    if risk_card.get("visualCaseIds"):
        raise ValueError("Population risk curves must not claim alternate-threshold frame visual evidence.")
    risk_methods = {str(method.get("methodId")): method for method in risk_card.get("methods", [])}
    if set(risk_methods) != set(RISK_COVERAGE_METHOD_IDS):
        raise ValueError("Risk-coverage card must preserve every canonical and explicitly unavailable method row.")
    populated_risk_curves = 0
    for method_id, method in risk_methods.items():
        points = method.get("riskCoverage")
        if points:
            populated_risk_curves += 1
            no_cutoff = [point for point in points if point.get("threshold") is None]
            if len(no_cutoff) != 1 or no_cutoff[0].get("thresholdLabel") != "No confidence cutoff":
                raise ValueError(f"Risk curve for {method_id} must preserve its single source-defined no-cutoff endpoint.")
            if any(point.get("coverage") is None or point.get("risk") is None for point in points):
                raise ValueError(f"Risk curve for {method_id} has an incomplete source-provided point.")
        elif not method.get("riskCoverageUnavailableReason"):
            raise ValueError(f"Unavailable risk curve for {method_id} needs an explicit evidence reason.")
    if populated_risk_curves < 1:
        raise ValueError("Risk-coverage export contains no populated canonical curves.")

    exact_cases = [case for case in visual.get("cases", []) if case.get("category") == "exact_gt"]
    exact_method_records = [method for case in exact_cases for frame in case.get("frames", []) for method in (frame.get("methods") or {}).values()]
    exact_measured_records = [method for method in exact_method_records if not method.get("unavailable")]
    expected_exact_method_record_count = len(exact_cases) * (len(EXACT_GT_SOURCES) + len(EXACT_GT_EXTRA_VISUAL_METHOD_IDS))
    if exact_cases and len(exact_method_records) != expected_exact_method_record_count:
        raise ValueError("Exact-GT visual cases must keep the selected case grid for every canonical spatial method.")
    if manifest.get("exactGtMethodCaseRecordCount") != len(exact_method_records):
        raise ValueError("Manifest Exact-GT method/case count does not match visual cases.")
    if manifest.get("exactGtMatchedMethodCaseRecordCount") != len(exact_measured_records):
        raise ValueError("Manifest Exact-GT matched method/case count does not match visual cases.")
    exact_mask_count = sum(
        1 for method in exact_method_records
        if isinstance(method.get("predictionMask"), str) and method["predictionMask"].startswith("/media/")
    )
    exact_comparison_count = sum(
        1 for method in exact_method_records
        if isinstance(method.get("maskComparison"), dict) and str(method["maskComparison"].get("src") or "").startswith("/media/")
    )
    if exact_mask_count != manifest.get("exactGtPredictionMaskAssetCount"):
        raise ValueError("Manifest Exact-GT prediction-mask asset count does not match visual cases.")
    if exact_comparison_count != manifest.get("exactGtPredictionComparisonAssetCount") or exact_comparison_count != exact_mask_count:
        raise ValueError("Every exported Exact-GT native mask must have a hash-bound TP/FP/FN comparison image.")
    exact_case_ids = {str(case.get("id")) for case in exact_cases}
    exact_doc = json.loads((output_dir / "exact_gt.json").read_text(encoding="utf-8"))
    if any(set(card.get("visualCaseIds") or []) != exact_case_ids for card in exact_doc.get("cards", [])):
        raise ValueError("Every Exact-GT metric card must link to all 25 applicable selected/severity visual cases.")
    severity_gt_masks = [
        frame.get("reference", {}).get("mask")
        for case in exact_cases
        for frame in case.get("frames", [])
        if (frame.get("mediaHashes") or {}).get("binaryPupilGtSha256")
    ]
    if len(severity_gt_masks) != 18 or any(not isinstance(mask, dict) or mask.get("kind") != "binary_pupil_ground_truth" or not mask.get("sha256") for mask in severity_gt_masks):
        raise ValueError("All 18 Exact-GT severity cases must provide a hash-bound binary pupil-only GT overlay while preserving the raw primary GT.")
    severity_grid = exact_doc.get("severityGrid") or {}
    if severity_grid.get("caseCount") != 18 or (severity_grid.get("pupilMaskAssets") or {}).get("assetCount") != 18:
        raise ValueError("Exact-GT severity metadata must retain all 18 frozen cases and binary pupil-only GT assets.")

    temporal_cases = [case for case in visual.get("cases", []) if case.get("category") == "temporal"]
    if len(temporal_cases) != manifest.get("temporalVisualCaseCount") or not temporal_cases:
        raise ValueError("Manifest temporal visual case count does not match the exported synchronized sequences.")
    temporal_case_ids = {str(case.get("id")) for case in temporal_cases}
    for case in temporal_cases:
        frames = case.get("frames") or []
        if len(frames) != 96:
            raise ValueError(f"Temporal visual case {case.get('id')} must preserve all 96 frames.")
        for frame in frames:
            methods = frame.get("methods") or {}
            if set(methods) != set(TEMPORAL_VISUAL_METHOD_IDS):
                raise ValueError(f"Temporal visual case {case.get('id')} does not preserve the 11 method states.")
    temporal_doc = json.loads((output_dir / "temporal.json").read_text(encoding="utf-8"))
    if any(set(card.get("visualCaseIds") or []) != temporal_case_ids for card in temporal_doc.get("cards", [])):
        raise ValueError("Temporal cards must point only to the exported V2.2 temporal sequences.")

    return {
        "version": manifest.get("version"),
        "cardCount": total_cards,
        "quantitativeMetricCardCount": quantitative_cards,
        "cardsByCategory": cards_by_category,
        "visualCaseCount": len(case_ids),
        "websiteVisualCaseCount": len(website_cases),
        "realValidationVisualCaseCount": manifest.get("realValidationVisualCaseCount"),
        "exactGtVisualCaseCount": manifest.get("exactGtVisualCaseCount"),
        "temporalVisualCaseCount": len(temporal_cases),
        "exactGtMethodCaseRecordCount": len(exact_method_records),
        "exactGtMatchedMethodCaseRecordCount": len(exact_measured_records),
        "exactGtVisualMethodCount": len(EXACT_GT_SOURCES) + len(EXACT_GT_EXTRA_VISUAL_METHOD_IDS),
        "exactGtPredictionMaskAssetCount": exact_mask_count,
        "exactGtPredictionComparisonAssetCount": exact_comparison_count,
        "exactGtPupilGtMaskAssetCount": len(severity_gt_masks),
        "riskCoverageMethodCount": len(risk_methods),
        "riskCoveragePopulatedMethodCount": populated_risk_curves,
        "capabilityDefinitionCount": len(capabilities),
        "deploymentConditionCount": len(deployment_conditions),
        "int8FailCoverageCount": len(int8_failed),
        "verifiedOutputFileCount": len(manifest.get("files", {})),
        "verifiedCanonicalInputCount": len(input_entries) if verify_canonical_inputs else 0,
        "provenanceInputReferenceCount": len(input_entries),
        "canonicalInputsChecked": verify_canonical_inputs,
        "brokenLocalAssets": 0,
        "mediaAssetHashesVerified": len(expected_media_hashes),
    }


def build(output_dir: Path = DEFAULT_OUT) -> dict[str, Any]:
    global _INPUTS
    _INPUTS = {}
    identity, identity_info = read_json(IDENTITY_PATH, "canonical method visual identity, family colors, and variant metadata")
    categories: dict[str, list[dict[str, Any]]] = {name: [] for name in [
        "real_validation", "geometry", "segmentation", "coverage_risk", "exact_gt", "temporal", "runtime", "deployment", "capabilities"
    ]}
    all_method_ids: set[str] = set()
    all_method_metadata: dict[str, dict[str, Any]] = {}

    real_payload, real_summary, real_method_metadata, real_info = parse_real_validation(identity, categories, all_method_ids)
    all_method_metadata.update(real_method_metadata)
    unet_rows, unet_info = parse_unet_comparison(identity, categories, all_method_ids)
    for row in unet_rows:
        all_method_metadata[row.get("method_id", "")] = {
            "method_id": row.get("method_id"),
            "label": {"unet_small": "U-Net small", "unet_base": "U-Net base", "unet_b2_matched": "U-Net B2-matched", "segformer_b2": "SegFormer B2"}.get(row.get("method_id"), row.get("method_id")),
            "family_id": "segformer" if row.get("method_id") == "segformer_b2" else "vanilla_unet",
            "representation": "native mask + common geometry",
            "isCanonical": True,
        }
    exact_sources, exact_info = parse_exact_gt(identity, categories, all_method_ids)
    for source in exact_sources:
        method_id = source["method_id"]
        all_method_metadata.setdefault(method_id, {
            "method_id": method_id, "label": method_id.replace("_", " "),
            "family_id": get_identity_maps(identity)[0].get(method_id, {}).get("family_id", "pupilext" if method_id in {"else", "excuse", "pure", "purest", "starburst", "swirski2d"} else "unknown"),
            "representation": source.get("representation"), "isCanonical": True,
        })
    temporal_data, temporal_info = parse_temporal(identity, categories, all_method_ids)
    temporal_visual_manifest, temporal_visual_manifest_info = read_json(
        TEMPORAL_VISUAL_MANIFEST_PATH,
        "bounded synchronized V2.2 temporal source, GT, and per-method frame media manifest",
    )
    temporal_visual_cases = build_temporal_visual_cases(temporal_visual_manifest, identity)
    runtime_rows, runtime_info = parse_runtime(identity, categories, all_method_ids)
    deployment_rows, deployment_info = build_deployment_rows(identity, categories, all_method_ids)
    capability_matrix, capability_rows, capability_info = parse_capabilities(identity, categories, all_method_ids)
    for row in runtime_rows:
        method_id = row.get("model_id", "")
        if method_id:
            all_method_metadata.setdefault(method_id, {"method_id": method_id, "label": method_id.replace("_", " "), "family_id": "unknown", "isCanonical": True})

    # Re-read the already hashed evidence source table for the representative
    # media join; values remain in the canonical frame CSVs.
    evidence_rows, evidence_info = read_csv(REAL_EVIDENCE_PATH, "real validation score provenance and frame-metric links")
    media_manifest = real_info.get("visualManifest")
    real_visual_cases, visual_join_info = build_real_visual_cases(identity, media_manifest, evidence_rows, real_summary)
    website_visual_cases = build_website_visual_cases_index(media_manifest or {}, real_info.get("visualManifestInfo") or {})
    acquisition_family_ids = visual_join_info.get("acquisitionFamilyIds", [])
    if acquisition_family_ids:
        for category in ("real_validation", "geometry", "segmentation", "coverage_risk"):
            for card in categories[category]:
                source_files = str((card.get("provenance") or {}).get("sourceFile", ""))
                if source_files.startswith((EXP + "/real_validation_v7/", UNET_PATH)) or (card.get("sourcePopulation", "").startswith("Corrected development validation")):
                    card["acquisitionFamilies"] = acquisition_family_ids
                    card["provenance"]["acquisitionFamilyIdCount"] = len(acquisition_family_ids)
    risk_coverage_info = add_risk_coverage_card(
        identity, categories, evidence_rows, evidence_info,
        acquisition_family_ids, unet_info,
    )
    exact_visual_manifest = exact_info.get("visualCases")
    prediction_media_source_manifest, prediction_media_source_info = read_json(
        EXACT_GT_PRIOR_MASK_CANDIDATE_PATH,
        "selected Exact-GT V2.1 native mask and source/GT identity manifest",
    )
    prediction_media_manifest, prediction_media_manifest_info = read_json(
        EXACT_GT_PREDICTION_MEDIA_MANIFEST_PATH,
        "hash-verified selected Exact-GT public prediction-mask media manifest",
    )
    prediction_media_manifest_info["sourceManifestSha256"] = prediction_media_source_info["sha256"]
    severity_media_manifest, severity_media_info = read_json(
        EXACT_GT_SEVERITY_MEDIA_MANIFEST_PATH,
        "prediction-blind Exact-GT V2.1 frozen perturbation severity grid and exact source/GT media manifest",
    )
    severity_prediction_media_manifest, severity_prediction_media_info = read_json(
        EXACT_GT_SEVERITY_PREDICTION_MEDIA_MANIFEST_PATH,
        "hash-bound retained native prediction mask assets for the Exact-GT severity grid",
    )
    severity_prediction_media_info["sourceGridManifestSha256"] = severity_media_info["sha256"]
    if str(severity_prediction_media_manifest.get("sourceGridManifestSha256") or "").lower() != severity_media_info["sha256"].lower():
        raise ValueError("Exact-GT severity prediction masks were not staged against the current frozen severity media manifest.")
    execution_rows_rel = f"{EXP}/exact_gt_execution_v2_1/EXACT_GT_V2_1_EXECUTION_ROWS.csv"
    execution_rows, execution_rows_info = read_csv(execution_rows_rel, "Exact-GT severity execution IDs and row indices")
    if str(severity_prediction_media_manifest.get("executionRowsSha256") or "").lower() != execution_rows_info["sha256"].lower():
        raise ValueError("Exact-GT severity prediction mask staging uses a different frozen execution-row table.")
    severity_pupil_gt_manifest, severity_pupil_gt_info = read_json(
        EXACT_GT_SEVERITY_PUPIL_GT_MEDIA_MANIFEST_PATH,
        "hash-bound binary pupil-only GT display masks extracted from the frozen Exact-GT labels",
    )
    severity_pupil_gt_info["sourceGridManifestSha256"] = severity_media_info["sha256"]
    zoo_geometry_info = exact_info["frameMetricSources"]["dlc_zoo_mouse_pupil_vclose"]
    if str(severity_pupil_gt_manifest.get("geometryMetricsSha256") or "").lower() != str(zoo_geometry_info["sha256"]).lower():
        raise ValueError("Exact-GT binary pupil-only GT display masks were validated against a different canonical geometry table.")
    if int(severity_pupil_gt_manifest.get("caseCount") or -1) != 18 or int(severity_pupil_gt_manifest.get("assetCount") or -1) != 18:
        raise ValueError("Exact-GT binary pupil-only GT manifest must cover all 18 severity cases.")
    severity_case_ids_from_grid = {str(case.get("id") or case.get("executionId") or "") for case in severity_media_manifest.get("cases", [])}
    severity_case_ids_from_masks = {str(asset.get("caseId") or asset.get("executionId") or "") for asset in severity_pupil_gt_manifest.get("assets", [])}
    if severity_case_ids_from_grid != severity_case_ids_from_masks:
        raise ValueError("Exact-GT binary pupil-only GT masks do not cover the exact frozen severity-grid case IDs.")
    prediction_comparison_manifest, prediction_comparison_info = read_json(
        EXACT_GT_PREDICTION_COMPARISON_MANIFEST_PATH,
        "hash-bound Exact-GT per-case TP/FP/FN comparison media for retained native masks",
    )
    comparison_source_expectations = {
        "severityPredictionManifestSha256": severity_prediction_media_info["sha256"],
        "severityMediaManifestSha256": severity_media_info["sha256"],
        "selectedMediaManifestSha256": exact_info["visualManifest"]["sha256"],
        "selectedPredictionManifestSha256": prediction_media_manifest_info["sha256"],
    }
    for field, expected_hash in comparison_source_expectations.items():
        if str(prediction_comparison_manifest.get(field) or "").lower() != expected_hash.lower():
            raise ValueError(f"Exact-GT comparison media manifest does not match the current {field}.")
    if severity_media_manifest.get("schema") != "mouse-pupillometry-benchmark-exact-gt-v21-severity-grid.v1":
        raise ValueError("Unsupported Exact-GT V2.1 severity media manifest schema.")
    if len(severity_media_manifest.get("cases", [])) != 18:
        raise ValueError("Exact-GT severity media manifest must preserve its 18-case frozen grid.")
    selected_case_ids = {str(case.get("id") or "") for case in (exact_visual_manifest or {}).get("cases", [])}
    severity_case_ids = {str(case.get("id") or "") for case in severity_media_manifest.get("cases", [])}
    if selected_case_ids & severity_case_ids or len(severity_case_ids) != 18:
        raise ValueError("Exact-GT selected media and severity grid cases must have unique stable execution IDs.")
    combined_exact_visual_manifest = {
        "cases": list((exact_visual_manifest or {}).get("cases", [])) + list(severity_media_manifest["cases"]),
    }
    exact_visual_cases = build_exact_gt_visual_cases(
        identity,
        combined_exact_visual_manifest,
        {c["id"] for c in real_visual_cases},
        exact_info["frameRowsByMethod"],
        exact_info["frameMetricSources"],
        prediction_media_manifest,
        prediction_media_source_manifest,
        prediction_media_manifest_info,
        severity_prediction_media_manifest,
        severity_prediction_media_info,
        prediction_comparison_manifest,
        prediction_comparison_info,
        severity_pupil_gt_manifest,
        severity_pupil_gt_info,
    )
    exact_gt_severity_rows, exact_gt_severity_doc = build_exact_gt_severity_rows(
        execution_rows, execution_rows_info,
        exact_info["frameRowsByMethod"], exact_info["frameMetricSources"],
    )
    visual_cases = real_visual_cases + exact_visual_cases + temporal_visual_cases
    exact_case_ids = [c["id"] for c in exact_visual_cases]
    if exact_case_ids:
        for card in categories["geometry"] + categories["segmentation"] + categories["coverage_risk"] + categories["exact_gt"]:
            if str(card.get("id", "")).startswith("exact-gt-"):
                card["visualCaseIds"] = exact_case_ids
                for method in card.get("methods", []):
                    method["visualCaseIds"] = exact_case_ids
    temporal_case_ids = [c["id"] for c in temporal_visual_cases]
    for card in categories["temporal"]:
        card["visualCaseIds"] = temporal_case_ids
        card["visualEvidenceUnavailableReason"] = None

    # Route-level summaries use these already canonical aggregate artifacts;
    # source hashes are registered before fingerprinting and are rechecked by
    # the export verifier.
    feature_atlas, feature_info = read_json(FEATURE_ATLAS_PATH, "canonical feature atlas aggregates, family intervals, Dice, and MPA validation values")
    keypoint_coverage, keypoint_info = read_json(KEYPOINT_COVERAGE_PATH, "canonical precomputed DLC and Pupil-DLC prospective coverage operating points")
    temporal_completion, temporal_completion_info = read_json(TEMPORAL_CANONICAL_COMPLETION_PATH, "hash-bound V2.2 temporal corpus and completion counts")
    mpa_summary, mpa_summary_info = read_json(MPA_MAPPING_FIXED_SUMMARY_PATH, "official mapping-fixed mouse-pupil-analysis v0.2.0 validation summary")
    mpa_manifest, mpa_manifest_info = read_json(MPA_MAPPING_FIXED_MANIFEST_PATH, "official mapping-fixed mouse-pupil-analysis v0.2.0 run manifest")
    mpa_feature_row = next((method for card in feature_atlas.get("cards", []) if card.get("id") == "feature-diameter_are" for method in card.get("methods", []) if method.get("method_id") == "mouse_pupil_analysis_v020"), {})
    mpa_frame_rows, mpa_frame_info = read_external_csv_reference(
        str(mpa_feature_row.get("source") or MPA_MAPPING_FIXED_FRAMES_PATH),
        str(mpa_feature_row.get("source_sha256") or ""),
        "official MPA V0.2.0 per-frame validation rows for hash and denominator verification",
    )
    if len(mpa_frame_rows) != int(as_number(mpa_summary.get("attempted")) or -1):
        raise ValueError("The mapping-fixed mouse-pupil-analysis per-frame row count does not match its canonical summary denominator.")
    atlas_validation_sha = str((feature_atlas.get("feature_v10") or {}).get("validation_manifest_sha256") or "").lower()
    if not atlas_validation_sha or str(mpa_manifest.get("validation_manifest_sha256") or "").lower() != atlas_validation_sha:
        raise ValueError("The mapping-fixed mouse-pupil-analysis run manifest does not match the feature atlas validation-manifest identity.")
    temporal_sequence_counts = [as_number(row.get("sequence_count")) for row in temporal_data.get("summaries", []) if as_number(row.get("sequence_count")) is not None]
    if (as_number(temporal_completion.get("seed_count")) != as_number((temporal_data.get("sourcePopulation") or {}).get("seedCount"))
            or temporal_sequence_counts and as_number(temporal_completion.get("sequence_count")) != max(temporal_sequence_counts)):
        raise ValueError("The temporal completion corpus counts do not match the exported canonical temporal metric summaries.")
    native_cpu_rows, native_cpu_csv_info = read_csv(NATIVE_CPU_RUNTIME_CSV_PATH, "verified separate native CPU runtime population")
    native_cpu_verification, native_cpu_verification_info = read_json(NATIVE_CPU_RUNTIME_VERIFICATION_PATH, "native CPU runtime table hash, hardware, stream, and protected-counter verification")
    native_cpu_runtime_export = build_native_cpu_runtime_export(native_cpu_rows, native_cpu_csv_info, native_cpu_verification, native_cpu_verification_info)

    identity_export = normalize_identity(identity, all_method_metadata)
    identity_export_info = identity_info
    # Input fingerprint is deterministic and includes every canonical file read.
    fingerprint_payload = json.dumps(
        [{"path": p, "sha256": _INPUTS[p]["sha256"]} for p in sorted(_INPUTS)],
        ensure_ascii=False, separators=(",", ":"),
    ).encode("utf-8")
    fingerprint = hashlib.sha256(fingerprint_payload).hexdigest()
    version = f"benchmark-data-dev-v2+{fingerprint[:16]}"

    overview_export, real_validation_export = build_overview_exports(
        real_summary=real_summary, real_info=real_info,
        unet_rows=unet_rows, unet_info=unet_info,
        runtime_rows=runtime_rows, runtime_info=runtime_info,
        feature_atlas=feature_atlas, feature_info=feature_info,
        keypoint=keypoint_coverage, keypoint_info=keypoint_info,
        mpa_summary=mpa_summary, mpa_summary_info=mpa_summary_info, mpa_manifest_info=mpa_manifest_info, mpa_frame_info=mpa_frame_info,
        execution_rows=execution_rows, temporal_data=temporal_data, temporal_completion=temporal_completion, temporal_completion_info=temporal_completion_info, fingerprint=fingerprint, version=version,
    )
    visual_case_index = {
        "schema": VISUAL_CASE_INDEX_SCHEMA,
        "version": version,
        "cases": [],
    }
    case_files: dict[str, Any] = {}
    for case in visual_cases:
        case_id = str(case.get("id") or "")
        if not case_id:
            raise ValueError("Cannot split a visual case without a stable ID.")
        case_filename = f"cases/{hashlib.sha256(case_id.encode('utf-8')).hexdigest()[:20]}.json"
        category = case.get("category")
        mode = case.get("mode") or ("representative" if case.get("representative") else None)
        visual_case_index["cases"].append({
            "id": case_id, "label": case.get("label") or case_id,
            "category": category, "mode": mode, "file": case_filename,
            "metricIds": case.get("metricIds") or [],
            "perturbationType": case.get("perturbationType"), "severity": case.get("severity"),
        })
        case_files[case_filename] = {"case": case}
    if len(visual_case_index["cases"]) != len(visual_cases):
        raise ValueError("Split visual case index lost a full-bundle case.")

    attach_version(categories, version)
    # The visual identity source carries no scientific outputs. It remains a
    # separate artifact, linked to the same content-addressed data version.
    identity_export["version"] = version
    temporal_data["version"] = version

    all_cards = sum(len(rows) for rows in categories.values())
    data_files: dict[str, Any] = {
        "methods.json": identity_export,
        "real_validation.json": {"schemaVersion": SCHEMA_VERSION, "category": "real_validation", "cards": categories["real_validation"]},
        "geometry.json": {"schemaVersion": SCHEMA_VERSION, "category": "geometry", "cards": categories["geometry"]},
        "segmentation.json": {"schemaVersion": SCHEMA_VERSION, "category": "segmentation", "cards": categories["segmentation"]},
        "coverage_risk.json": {"schemaVersion": SCHEMA_VERSION, "category": "coverage_risk", "cards": categories["coverage_risk"]},
        "exact_gt.json": {
            "schemaVersion": SCHEMA_VERSION,
            "category": "exact_gt",
            "cards": categories["exact_gt"],
            "severityRows": [row for row in exact_gt_severity_rows if row.get("methodId") == "segformer_b2"],
            "severityGrid": {
                "status": "FROZEN_EXAMPLES_ONLY",
                "caseCount": len(severity_media_manifest.get("cases", [])),
                "familyCounts": severity_media_manifest.get("selection", {}).get("familyCounts", {}),
                "availableFamilies": sorted(severity_media_manifest.get("selection", {}).get("familyCounts", {})),
                "unavailableRequestedExamples": severity_media_manifest.get("unavailableRequestedExamples", []),
                "sourceManifest": {
                    "path": severity_media_info.get("path"),
                    "sha256": severity_media_info.get("sha256"),
                },
                "pupilMaskAssets": {
                    "manifestPath": severity_pupil_gt_info.get("path"),
                    "manifestSha256": severity_pupil_gt_info.get("sha256"),
                    "assetCount": severity_pupil_gt_manifest.get("assetCount"),
                    "coordinateSystem": "binary pupil-only mask on the transformed source raster; raw RGB primary GT remains at reference.gt",
                    "cases": [
                        {
                            key: asset.get(key)
                            for key in ("caseId", "rowIndex", "primaryGtSha256", "publicUrl", "publicSha256", "width", "height", "pupilPixelCount", "canonicalTruthArea")
                        }
                        for asset in severity_pupil_gt_manifest.get("assets", [])
                    ],
                },
            },
        },
        "temporal.json": {"schemaVersion": SCHEMA_VERSION, "category": "temporal", "cards": categories["temporal"], "data": temporal_data},
        "runtime.json": {"schemaVersion": SCHEMA_VERSION, "category": "runtime", "cards": categories["runtime"]},
        "native_cpu_runtime_v2.json": native_cpu_runtime_export,
        "deployment.json": {"schemaVersion": SCHEMA_VERSION, "category": "deployment", "cards": categories["deployment"]},
        "capabilities.json": {
            "schemaVersion": SCHEMA_VERSION,
            "category": "capabilities",
            "cards": categories["capabilities"],
            "matrix": capability_matrix["capabilities"],
            "sourceFile": capability_matrix["sourceFile"],
            "sourceSha256": capability_matrix["sourceSha256"],
            "methodCount": capability_matrix["methodCount"],
            "capabilityCount": capability_matrix["capabilityCount"],
        },
        "visual_cases.json": {"schemaVersion": SCHEMA_VERSION, "cases": visual_cases},
        "exact_gt_severity_v2.json": exact_gt_severity_doc,
        "overview_v2.json": overview_export,
        "real_validation_v2.json": real_validation_export,
        "visual_case_index_v2.json": visual_case_index,
        "WEBSITE_VISUAL_CASES.json": website_visual_cases,
        "provenance.json": {
            "schemaVersion": SCHEMA_VERSION,
            "version": version,
            "freeze": None,
            "freezeStatus": "DEVELOPMENT_NOT_FORMALLY_FROZEN",
            "generatedAt": None,
            "generatedAtPolicy": "Omitted to keep identical canonical inputs byte-reproducible.",
            "sourcePolicy": "Only whitelisted canonical CSV/JSON files and bounded media manifests are read. Reported scientific values pass through; Exact-GT severity cells are deterministic means grouped from hash-verified canonical frame rows, with accepted and attempted counts preserved and no inferred examples or confidence intervals.",
            "inputs": [_INPUTS[p] for p in sorted(_INPUTS)],
            "evidenceGroups": {
                "methodIdentity": {"path": identity_export_info["path"], "sha256": identity_export_info["sha256"]},
                "realValidation": {"payload": real_info["payload"], "summary": real_info["summary"], "evidence": real_info["evidence"]},
                "websiteVisualCases": {"sourceManifest": real_info.get("visualManifestInfo"), "sourcePolicy": website_visual_cases.get("selectionPolicy"), "caseCount": len(website_visual_cases.get("cases", []))},
                "riskCoverage": risk_coverage_info,
                "architectureControl": unet_info,
                "exactGt": {
                    "summaries": exact_info["sources"],
                    "frameMetrics": exact_info["frameMetricSources"],
                    "visualManifest": exact_info["visualManifest"],
                    "severityMedia": severity_media_info,
                    "severityPupilGt": {
                        "manifest": severity_pupil_gt_info,
                        "assetCount": severity_pupil_gt_manifest["assetCount"],
                        "geometryMetrics": zoo_geometry_info,
                    },
                    "severityPredictionMasks": {
                        "manifest": severity_prediction_media_info,
                        "assetCount": severity_prediction_media_manifest["assetCount"],
                        "methodIds": severity_prediction_media_manifest["methodIds"],
                        "executionRows": execution_rows_info,
                    },
                    "predictionComparisons": {
                        "manifest": prediction_comparison_info,
                        "assetCount": prediction_comparison_manifest["assetCount"],
                        "caseCount": prediction_comparison_manifest["caseCount"],
                        "legend": prediction_comparison_manifest["legend"],
                    },
                },
                "temporal": temporal_info,
                "runtime": {"csv": runtime_info["csvInfo"], "completion": runtime_info["completionInfo"]},
                "nativeCpuRuntime": {"csv": native_cpu_csv_info, "verification": native_cpu_verification_info, "methodCount": len(native_cpu_runtime_export["conditions"])},
                "deployment": {"matrix": deployment_info["matrixInfo"], "int8": deployment_info["int8Info"]},
                "capabilities": capability_info,
                "visualJoin": visual_join_info,
            },
            "excludedInputFamilies": ["Allen/external evaluation", "protected material"],
        },
    }
    data_files.update(case_files)
    output_dir.mkdir(parents=True, exist_ok=True)
    file_entries = {}
    for name, content in data_files.items():
        path = output_dir / name
        write_json(path, content)
        file_entries[name] = {"sha256": sha256_file(path), "sizeBytes": path.stat().st_size}

    deployment_status_counts: dict[str, int] = defaultdict(int)
    for row in deployment_rows:
        deployment_status_counts[str(row.get("status") or "NOT_REPORTED")] += 1
    exact_method_case_records = [
        method
        for case in exact_visual_cases
        for frame in case.get("frames", [])
        for method in (frame.get("methods") or {}).values()
    ]
    exact_matched_method_case_records = [method for method in exact_method_case_records if not method.get("unavailable")]
    exact_prediction_mask_asset_count = sum(1 for method in exact_method_case_records if isinstance(method.get("predictionMask"), str) and method["predictionMask"].startswith("/media/"))
    exact_prediction_comparison_asset_count = sum(1 for method in exact_method_case_records if isinstance(method.get("maskComparison"), dict) and str(method["maskComparison"].get("src") or "").startswith("/media/"))
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "version": version,
        "freeze": None,
        "freezeStatus": "DEVELOPMENT_NOT_FORMALLY_FROZEN",
        "status": "DEVELOPMENT",
        "externalEvaluation": "NOT_OPENED",
        "generatedAt": None,
        "generatedAtPolicy": "Omitted to keep identical canonical inputs byte-reproducible.",
        "reproducible": True,
        "sourceFingerprintSha256": fingerprint,
        "cardCount": all_cards,
        "cardsByCategory": {key: len(value) for key, value in categories.items()},
        "methodIdentityCount": len(identity_export["variants"]),
        "capabilityDefinitionCount": capability_matrix["capabilityCount"],
        "capabilityMethodCount": capability_matrix["methodCount"],
        "visualCaseCount": len(visual_cases),
        "splitVisualCaseCount": len(visual_case_index["cases"]),
        "realValidationConditionCount": len(real_validation_export["conditions"]),
        "exactGtSeverityRowCount": len(exact_gt_severity_rows),
        "exactGtSeverityMethodCount": len(EXACT_GT_SEVERITY_METHODS),
        "overviewSizeBytes": len(json.dumps(overview_export, ensure_ascii=False, separators=(",", ":")).encode("utf-8")),
        "realValidationVisualCaseCount": len(real_visual_cases),
        "websiteVisualCaseCount": len(website_visual_cases.get("cases", [])),
        "exactGtVisualCaseCount": len(exact_visual_cases),
        "temporalVisualCaseCount": len(temporal_visual_cases),
        "exactGtMethodCaseRecordCount": len(exact_method_case_records),
        "exactGtMatchedMethodCaseRecordCount": len(exact_matched_method_case_records),
        "exactGtVisualMethodCount": len(EXACT_GT_SOURCES) + len(EXACT_GT_EXTRA_VISUAL_METHOD_IDS),
        "exactGtPredictionMaskAssetCount": exact_prediction_mask_asset_count,
        "exactGtPredictionComparisonAssetCount": exact_prediction_comparison_asset_count,
        "exactGtPupilGtMaskAssetCount": severity_pupil_gt_manifest.get("assetCount"),
        "riskCoverageMethodCount": len(risk_coverage_info.get("methods", {})),
        "riskCoveragePopulatedMethodCount": sum(bool(row.get("riskCoverage")) for row in risk_coverage_info.get("methods", {}).values()),
        "exactGtSpatialMethodCount": len(exact_sources),
        "runtimeMethodCount": as_number(runtime_info["completion"].get("verified_method_count")),
        "nativeCpuRuntimeMethodCount": len(native_cpu_runtime_export["conditions"]),
        "deploymentConditionCount": len(deployment_rows),
        "deploymentStatusCounts": dict(sorted(deployment_status_counts.items())),
        "gates": {
            "realValidation": "EXPORTED_FROM_CANONICAL_DEVELOPMENT_TABLES",
            "exactGt": "EXPORTED_FROM_CANONICAL_SPATIAL_SUMMARIES",
            "temporal": "EXPORTED_WITH_METHOD_SPECIFIC_COVERAGE_AND_PER_SEED_FIDELITY",
            "runtime": str(runtime_info["completion"].get("status") or "QUALIFIED"),
            "deployment": "ALL_30_CONDITIONS_INCLUDING_EXECUTED_INT8_FAIL_COVERAGE",
            "externalEvaluation": "NOT_OPENED",
        },
        "safety": {
            "allenModelScoring": as_number(temporal_data.get("interimManifest", {}).get("allenModelScoring")),
            "legacyProtectedInferenceQueries": as_number(temporal_data.get("interimManifest", {}).get("legacyProtectedInferenceQueries")),
            "externalEvaluation": "NOT_OPENED",
        },
        "files": file_entries,
    }
    write_json(output_dir / "benchmark_manifest.json", manifest)
    manifest["manifestSha256"] = sha256_file(output_dir / "benchmark_manifest.json")
    manifest["manifestSizeBytes"] = (output_dir / "benchmark_manifest.json").stat().st_size
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT, help="Output directory (defaults to benchmark_site/public/data).")
    parser.add_argument("--verify", action="store_true", help="Verify exported hashes, completeness, case IDs, and local media references.")
    parser.add_argument("--verify-export-only", action="store_true", help="Verify a packaged export and public media without reading canonical source inputs.")
    args = parser.parse_args(argv)
    if args.verify and args.verify_export_only:
        parser.error("Choose either --verify or --verify-export-only.")
    if args.verify_export_only:
        result = verify_output(args.output_dir.resolve(), verify_canonical_inputs=False)
        print(json.dumps(result, indent=2))
        return 0
    if args.verify:
        result = verify_output(args.output_dir.resolve())
        print(json.dumps(result, indent=2))
        return 0
    manifest = build(args.output_dir.resolve())
    print(json.dumps({
        "output": safe_relative(args.output_dir.resolve()) if args.output_dir.resolve().is_relative_to(ROOT.resolve()) else str(args.output_dir.resolve()),
        "version": manifest["version"],
        "cardCount": manifest["cardCount"],
        "cardsByCategory": manifest["cardsByCategory"],
        "visualCaseCount": manifest["visualCaseCount"],
        "websiteVisualCaseCount": manifest["websiteVisualCaseCount"],
        "temporalVisualCaseCount": manifest["temporalVisualCaseCount"],
        "exactGtSpatialMethodCount": manifest["exactGtSpatialMethodCount"],
        "runtimeMethodCount": manifest["runtimeMethodCount"],
        "deploymentConditionCount": manifest["deploymentConditionCount"],
        "externalEvaluation": manifest["externalEvaluation"],
        "manifestSha256": manifest["manifestSha256"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
