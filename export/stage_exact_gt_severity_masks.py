#!/usr/bin/env python3
"""Stage only hash-joined retained native masks for the frozen Exact-GT grid.

Run with the mouseformer local analysis Python that provides NumPy and Pillow.
The script never invokes inference and does not create or alter scientific rows.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "parallel_handoffs/benchmark_expansion_20260919"
MEDIA_MANIFEST = ROOT / "benchmark_site/media_export/exact_gt_v21_severity_grid_v1.json"
EXECUTION_ROWS = BENCH / "exact_gt_execution_v2_1/EXACT_GT_V2_1_EXECUTION_ROWS.csv"
UNET_ARRAY_DIR = BENCH / "visual_qc_candidate_20260923/remote_readonly_unet_masks"
MEYE_RELEASED_ARRAY = BENCH / "visual_qc_prior_worst_20260924_v1/remote_readonly_meye_masks/NATIVE_MASKS_128_PACKED.npy"
OUT_DIR = ROOT / "benchmark_site/public/media/exact-gt/predictions"
OUT_MANIFEST = ROOT / "benchmark_site/media_export/exact_gt_v21_severity_prediction_masks_v1.json"
SELECTED_MEDIA_MANIFEST = ROOT / "benchmark_site/media_export/exact_gt_selected_cases_20260924_v1.json"
SELECTED_PREDICTION_MEDIA_MANIFEST = BENCH / "visual_qc_prior_worst_20260924_v1/EXACT_GT_V21_PUBLIC_PREDICTION_MEDIA_HASH_MANIFEST_V1.json"
COMPARISON_MANIFEST = ROOT / "benchmark_site/media_export/exact_gt_v21_prediction_comparison_media_v1.json"
SEVERITY_PUPIL_GT_MANIFEST = ROOT / "benchmark_site/media_export/exact_gt_v21_severity_pupil_gt_v1.json"
SPATIAL_GEOMETRY_METRICS = BENCH / "closure_dlc_zoo_exact_gt_v21/results/dlc_zoo_v21_spatial_geometry_only/FRAME_GEOMETRY_METRICS.csv"

METHOD_SPECS: dict[str, dict[str, Any]] = {
    "segformer_b0": {
        "kind": "segformer", "native": "exact_gt_execution_v2_1/segformer_b0_v21/NATIVE_PREDICTIONS.csv",
        "scores": "exact_gt_execution_v2_1/segformer_b0_v21/FRAME_METRICS.csv",
        "packed": "exact_gt_execution_v2_1/segformer_b0_v21/NATIVE_MASKS_PACKED.npy",
        "shapes": "exact_gt_execution_v2_1/segformer_b0_v21/NATIVE_MASK_SHAPES.npy",
    },
    "segformer_b1": {
        "kind": "segformer", "native": "exact_gt_execution_v2_1/segformer_b1_v21/NATIVE_PREDICTIONS.csv",
        "scores": "exact_gt_execution_v2_1/segformer_b1_v21/FRAME_METRICS.csv",
        "packed": "exact_gt_execution_v2_1/segformer_b1_v21/NATIVE_MASKS_PACKED.npy",
        "shapes": "exact_gt_execution_v2_1/segformer_b1_v21/NATIVE_MASK_SHAPES.npy",
    },
    "segformer_b2": {
        "kind": "segformer", "native": "exact_gt_execution_v2_1/segformer_b2_v21/NATIVE_PREDICTIONS.csv",
        "scores": "exact_gt_execution_v2_1/segformer_b2_v21/FRAME_METRICS.csv",
        "packed": "exact_gt_execution_v2_1/segformer_b2_v21/NATIVE_MASKS_PACKED.npy",
        "shapes": "exact_gt_execution_v2_1/segformer_b2_v21/NATIVE_MASK_SHAPES.npy",
    },
    "meye_matched": {
        "kind": "mask_128", "native": "closure_meye_matched_exact_gt_v21/results/meye_matched_spatial_v21/NATIVE_PREDICTIONS.csv",
        "scores": "closure_meye_matched_exact_gt_v21/scored/meye_matched_spatial_v21/FRAME_METRICS.csv",
        "packed": "closure_meye_matched_exact_gt_v21/results/meye_matched_spatial_v21/NATIVE_MASKS_128_PACKED.npy",
    },
    "meye_released": {
        "kind": "mask_128", "native": "closure_meye_exact_gt_v21/collected/meye_released/native/NATIVE_PREDICTIONS.csv",
        "scores": "closure_meye_exact_gt_v21/collected/meye_released/scored/FRAME_METRICS.csv",
        "packed": "visual_qc_prior_worst_20260924_v1/remote_readonly_meye_masks/NATIVE_MASKS_128_PACKED.npy",
    },
    "unet_small": {
        "kind": "source_mask", "native": "closure_unet_exact_gt_v21/collected/small/NATIVE_PREDICTIONS.csv",
        "scores": "closure_unet_exact_gt_v21/collected/small/FRAME_METRICS.csv",
        "packed": "visual_qc_candidate_20260923/remote_readonly_unet_masks/unet_small_NATIVE_MASKS_PACKED.npy",
        "shapes": "visual_qc_candidate_20260923/remote_readonly_unet_masks/NATIVE_MASK_SHAPES.npy",
    },
    "unet_base": {
        "kind": "source_mask", "native": "closure_unet_exact_gt_v21/collected/base/NATIVE_PREDICTIONS.csv",
        "scores": "closure_unet_exact_gt_v21/collected/base/FRAME_METRICS.csv",
        "packed": "visual_qc_candidate_20260923/remote_readonly_unet_masks/unet_base_NATIVE_MASKS_PACKED.npy",
        "shapes": "visual_qc_candidate_20260923/remote_readonly_unet_masks/NATIVE_MASK_SHAPES.npy",
    },
    "unet_b2_matched": {
        "kind": "source_mask", "native": "closure_unet_exact_gt_v21/collected/b2_matched/NATIVE_PREDICTIONS.csv",
        "scores": "closure_unet_exact_gt_v21/collected/b2_matched/FRAME_METRICS.csv",
        "packed": "visual_qc_candidate_20260923/remote_readonly_unet_masks/unet_b2_matched_NATIVE_MASKS_PACKED.npy",
        "shapes": "visual_qc_candidate_20260923/remote_readonly_unet_masks/NATIVE_MASK_SHAPES.npy",
    },
    "mouse_pupil_analysis_v020": {
        "kind": "mouse_pupil_analysis", "native": "exact_gt_execution_v2_1/mouse_pupil_analysis_v020/NATIVE_PREDICTIONS.csv",
        "scores": "exact_gt_execution_v2_1/mouse_pupil_analysis_v020/FRAME_METRICS.csv",
        "packed": "exact_gt_execution_v2_1/mouse_pupil_analysis_v020/NATIVE_MASKS_PACKED.npy",
        "shapes": "exact_gt_execution_v2_1/mouse_pupil_analysis_v020/NATIVE_MASK_SHAPES.npy",
    },
    "classical_fixed": {
        "kind": "classical_npz", "native": "exact_gt_execution_v2_1/classical_fixed_v1/NATIVE_PREDICTIONS.csv",
        "scores": "exact_gt_execution_v2_1/classical_fixed_v1/FRAME_METRICS.csv",
    },
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def keyed(rows: list[dict[str, str]], primary: str = "execution_id") -> dict[str, tuple[int, dict[str, str]]]:
    output: dict[str, tuple[int, dict[str, str]]] = {}
    for ordinal, row in enumerate(rows):
        key = row.get(primary) or row.get("sample_id")
        if key:
            if key in output:
                raise ValueError(f"duplicate native prediction identity: {key}")
            output[key] = (ordinal, row)
    return output


def unpack_row(spec: dict[str, Any], rank: int, native_row: dict[str, str], source_size: tuple[int, int]) -> np.ndarray:
    kind = spec["kind"]
    if kind in {"segformer", "source_mask", "mouse_pupil_analysis"}:
        packed = np.load((BENCH / spec["packed"]).resolve(), mmap_mode="r", allow_pickle=False)
        shapes = np.load((BENCH / spec["shapes"]).resolve(), mmap_mode="r", allow_pickle=False)
        h, w = (int(x) for x in shapes[rank])
        if kind == "segformer":
            bits = packed[rank, 0, :h]
        elif kind == "source_mask":
            bits = packed[rank, 0, :h]
        else:
            bits = packed[rank, :h]
        mask = np.unpackbits(bits, axis=1)[:, :w].astype(bool)
        if mask.shape != (source_size[1], source_size[0]):
            raise ValueError(f"source-raster native mask shape {mask.shape} != {source_size[::-1]}")
        expected_pixels = native_row.get("native_pupil_area_px")
        if expected_pixels in (None, "") and kind != "mouse_pupil_analysis":
            expected_pixels = native_row.get("native_foreground_pixels")
        if expected_pixels not in (None, "") and kind != "mouse_pupil_analysis" and int(float(expected_pixels)) != int(mask.sum()):
            raise ValueError("native mask pixel count does not match retained native prediction ledger")
        return mask
    if kind == "mask_128":
        packed = np.load((BENCH / spec["packed"]).resolve(), mmap_mode="r", allow_pickle=False)
        mask = np.unpackbits(packed[rank], axis=1)[:, :128].astype(bool)
        declared_hash = str(native_row.get("mask_128_sha256") or "").lower()
        actual_hash = hashlib.sha256(np.ascontiguousarray(mask.astype(np.uint8)).tobytes()).hexdigest()
        if not declared_hash or actual_hash != declared_hash:
            raise ValueError("128x128 native mask differs from the frozen per-row mask hash")
        return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize(source_size, Image.Resampling.NEAREST)) > 0
    if kind == "classical_npz":
        archive_rel = str(native_row.get("prediction_path") or "")
        archive_path = BENCH / "exact_gt_execution_v2_1" / archive_rel
        if not archive_path.is_file() or sha(archive_path) != str(native_row.get("prediction_sha256") or "").lower():
            raise ValueError("classical native mask archive is missing or differs from its row hash")
        with np.load(archive_path, allow_pickle=False) as archive:
            raw = archive["mask"]
            h, w = (int(x) for x in archive["shape"])
            mask = np.unpackbits(raw)[:h * w].reshape(h, w).astype(bool)
        if mask.shape != (source_size[1], source_size[0]):
            raise ValueError("classical native mask is not in the transformed source raster")
        if int(float(native_row.get("area") or 0)) != int(mask.sum()):
            raise ValueError("classical mask area does not match frozen native row")
        return mask
    raise ValueError(f"unsupported native output kind: {kind}")


LEGEND = {
    "truePositive": "#22c55e",
    "falsePositive": "#3b82f6",
    "falseNegative": "#ef4444",
    "background": "#000000",
}


def pupil_pixels(path: Path, gt_format: str) -> np.ndarray:
    with Image.open(path) as image:
        if gt_format == "binary":
            return np.asarray(image.convert("L")) > 0
        if gt_format == "rgb_labels_yellow_pupil":
            rgb = np.asarray(image.convert("RGB"))
            return (rgb[..., 0] > 200) & (rgb[..., 1] > 200) & (rgb[..., 2] < 80)
    raise ValueError(f"unsupported frozen GT format: {gt_format}")


def stage_comparison(
    *, case_id: str, method_id: str, row_index: int | None,
    source_url: str, source_sha: str, gt_display_url: str, gt_display_sha: str,
    gt_raw_path: Path | None, gt_raw_sha: str | None, gt_format: str,
    gt_display_format: str,
    prediction_url: str, prediction_sha: str, category: str, verify_only: bool,
) -> dict[str, Any]:
    source_path = ROOT / "benchmark_site/public" / source_url.lstrip("/")
    gt_display_path = ROOT / "benchmark_site/public" / gt_display_url.lstrip("/")
    prediction_path = ROOT / "benchmark_site/public" / prediction_url.lstrip("/")
    for path, expected, label in (
        (source_path, source_sha, "source"), (gt_display_path, gt_display_sha, "display GT"),
        (prediction_path, prediction_sha, "prediction mask"),
    ):
        if not path.is_file() or sha(path).lower() != str(expected).lower():
            raise ValueError(f"{label} asset missing or hash-mismatched for {case_id}/{method_id}")
    with Image.open(source_path) as source:
        dimensions = source.size
    with Image.open(gt_display_path) as image:
        display_dimensions = image.size
        if display_dimensions != dimensions:
            raise ValueError(f"GT display raster dimension mismatch for {case_id}/{method_id}")
    visible_gt = pupil_pixels(gt_display_path, gt_display_format)
    if gt_raw_path is not None:
        if not gt_raw_path.is_file() or sha(gt_raw_path).lower() != str(gt_raw_sha or "").lower():
            raise ValueError(f"canonical raw GT asset missing or hash-mismatched for {case_id}")
        gt = pupil_pixels(gt_raw_path, gt_format)
    else:
        gt = pupil_pixels(gt_display_path, gt_format)
    with Image.open(prediction_path) as image:
        pred = np.asarray(image.convert("L")) > 0
        if image.size != dimensions:
            raise ValueError(f"prediction raster dimension mismatch for {case_id}/{method_id}")
    if gt.shape != (dimensions[1], dimensions[0]) or pred.shape != gt.shape:
        raise ValueError(f"GT/prediction coordinate mismatch for {case_id}/{method_id}")
    if not np.array_equal(visible_gt, gt):
        raise ValueError(f"display GT differs pixelwise from frozen GT class extraction for {case_id}")

    rgb = np.zeros((*gt.shape, 3), dtype=np.uint8)
    rgb[gt & pred] = (34, 197, 94)
    rgb[pred & ~gt] = (59, 130, 246)
    rgb[gt & ~pred] = (239, 68, 68)
    comparison_url = f"/media/exact-gt/prediction-comparisons/{method_id}/{case_id}.png"
    comparison_path = ROOT / "benchmark_site/public" / comparison_url.lstrip("/")
    comparison_path.parent.mkdir(parents=True, exist_ok=True)
    if not verify_only:
        Image.fromarray(rgb, mode="RGB").save(comparison_path, format="PNG", optimize=False)
    if not comparison_path.is_file():
        raise FileNotFoundError(f"comparison map missing: {comparison_url}")
    with Image.open(comparison_path) as image:
        staged = np.asarray(image.convert("RGB"))
        if image.size != dimensions or not np.array_equal(staged, rgb):
            raise ValueError(f"comparison map pixels/dimensions differ from hash-joined native masks for {case_id}/{method_id}")
    return {
        "caseId": case_id, "methodId": method_id, "rowIndex": row_index,
        "category": category,
        "comparisonPath": "benchmark_site/public" + comparison_url,
        "comparisonUrl": comparison_url, "comparisonSha256": sha(comparison_path),
        "sourceImageSha256": source_sha, "primaryGtSha256": gt_raw_sha or gt_display_sha,
        "gtDisplayUrl": gt_display_url, "gtDisplaySha256": gt_display_sha,
        "predictionMaskUrl": prediction_url, "predictionMaskSha256": prediction_sha,
        "width": dimensions[0], "height": dimensions[1],
        "truePositivePixels": int((gt & pred).sum()),
        "falsePositivePixels": int((pred & ~gt).sum()),
        "falseNegativePixels": int((gt & ~pred).sum()),
        "legend": LEGEND,
        "coordinateSystem": "pixel-for-pixel transformed-source raster; no resize",
    }


def stage_severity_pupil_gt(grid_doc: dict[str, Any], verify_only: bool) -> dict[str, Any]:
    """Export the yellow pupil label as a binary overlay mask, preserving the raw RGB GT separately."""
    score_rows = csv_rows(SPATIAL_GEOMETRY_METRICS)
    score_by_id = keyed(score_rows, "execution_id")
    score_sha = sha(SPATIAL_GEOMETRY_METRICS)
    assets: list[dict[str, Any]] = []
    for case in grid_doc["cases"]:
        case_id = str(case.get("executionId") or case["id"])
        row_index = int(case["rowIndex"])
        score_record = score_by_id.get(case_id)
        if score_record is None:
            raise ValueError(f"canonical spatial geometry has no GT row for severity case {case_id}")
        score_rank, score_row = score_record
        source_sha = str(case["frames"][0]["mediaHashes"]["transformedSourceSha256"]).lower()
        gt_sha = str(case["frames"][0]["mediaHashes"]["primaryGtSha256"]).lower()
        if score_rank != row_index or int(score_row.get("row_index") or -1) != row_index:
            raise ValueError(f"canonical GT geometry row index does not match severity case {case_id}")
        if str(score_row.get("source_image_sha256") or "").lower() != source_sha or str(score_row.get("primary_gt_sha256") or "").lower() != gt_sha:
            raise ValueError(f"canonical GT geometry source/GT identity differs for severity case {case_id}")
        frame = case["frames"][0]
        source_path = ROOT / "benchmark_site/public" / str(frame["sourceSrc"]).lstrip("/")
        raw_gt_url = str(frame["reference"]["gt"])
        raw_gt_path = ROOT / "benchmark_site/public" / raw_gt_url.lstrip("/")
        if not source_path.is_file() or sha(source_path).lower() != source_sha:
            raise ValueError(f"severity source is missing or hash-mismatched for {case_id}")
        if not raw_gt_path.is_file() or sha(raw_gt_path).lower() != gt_sha:
            raise ValueError(f"severity primary GT is missing or hash-mismatched for {case_id}")
        with Image.open(source_path) as source, Image.open(raw_gt_path) as raw_gt:
            if source.size != (int(frame["width"]), int(frame["height"])) or raw_gt.size != source.size:
                raise ValueError(f"severity source/GT raster dimensions differ for {case_id}")
        gt_mask = pupil_pixels(raw_gt_path, str(frame["reference"].get("primaryGtFormat") or "rgb_labels_yellow_pupil"))
        expected_area = float(score_row["truth_area"])
        if not np.isclose(float(gt_mask.sum()), expected_area, rtol=0, atol=1e-9):
            raise ValueError(f"binary pupil-label pixels do not match canonical truth_area for {case_id}")
        public_url = f"/media/exact-gt/severity-grid/pupil-mask/{case_id}.png"
        public_path = ROOT / "benchmark_site/public" / public_url.lstrip("/")
        public_path.parent.mkdir(parents=True, exist_ok=True)
        binary = gt_mask.astype(np.uint8) * 255
        if not verify_only:
            Image.fromarray(binary, mode="L").save(public_path, format="PNG", optimize=False)
        if not public_path.is_file():
            raise FileNotFoundError(f"binary pupil-only GT mask was not staged: {public_url}")
        with Image.open(public_path) as staged:
            staged_mask = np.asarray(staged.convert("L")) > 0
            if staged.size != (int(frame["width"]), int(frame["height"])) or not np.array_equal(staged_mask, gt_mask):
                raise ValueError(f"binary pupil-only GT PNG differs from primary-GT pupil label for {case_id}")
        assets.append({
            "caseId": case_id,
            "executionId": case_id,
            "rowIndex": row_index,
            "sourceImageSha256": source_sha,
            "primaryGtSha256": gt_sha,
            "primaryGtPath": str(raw_gt_path.relative_to(ROOT)),
            "primaryGtFormat": str(frame["reference"].get("primaryGtFormat") or "rgb_labels_yellow_pupil"),
            "publicPath": "benchmark_site/public" + public_url,
            "publicUrl": public_url,
            "publicSha256": sha(public_path),
            "width": int(frame["width"]),
            "height": int(frame["height"]),
            "pupilPixelCount": int(gt_mask.sum()),
            "canonicalTruthArea": expected_area,
            "geometryMetricsPath": str(SPATIAL_GEOMETRY_METRICS.relative_to(ROOT)),
            "geometryMetricsSha256": score_sha,
            "coordinateSystem": "pixel-for-pixel transformed-source raster; no resize",
            "labelExtraction": "yellow pupil class only from frozen RGB primary GT; output is 255 for pupil and 0 otherwise",
        })
    payload = {
        "schema": "EXACT_GT_V21_SEVERITY_PUPIL_GT_MEDIA_V1",
        "sourceGridManifestPath": str(MEDIA_MANIFEST.relative_to(ROOT)),
        "sourceGridManifestSha256": sha(MEDIA_MANIFEST),
        "geometryMetricsPath": str(SPATIAL_GEOMETRY_METRICS.relative_to(ROOT)),
        "geometryMetricsSha256": score_sha,
        "caseCount": len(assets),
        "assetCount": len(assets),
        "assets": assets,
    }
    if verify_only:
        existing = json.loads(SEVERITY_PUPIL_GT_MANIFEST.read_text(encoding="utf-8"))
        if existing != payload:
            raise ValueError("binary Exact-GT severity pupil-mask manifest differs from frozen input hashes")
    else:
        SEVERITY_PUPIL_GT_MANIFEST.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true", help="verify an existing staged manifest and assets")
    args = parser.parse_args()
    grid_doc = json.loads(MEDIA_MANIFEST.read_text(encoding="utf-8"))
    if grid_doc.get("schema") != "mouse-pupillometry-benchmark-exact-gt-v21-severity-grid.v1" or len(grid_doc.get("cases", [])) != 18:
        raise ValueError("unexpected frozen severity media manifest")
    execution = csv_rows(EXECUTION_ROWS)
    execution_by_id = {r["execution_id"]: r for r in execution}
    if len(execution_by_id) != len(execution):
        raise ValueError("duplicate Exact-GT V2.1 execution IDs")

    pupil_gt_payload = stage_severity_pupil_gt(grid_doc, args.verify_only)

    assets: list[dict[str, Any]] = []
    comparisons: list[dict[str, Any]] = []
    for method_id, spec in METHOD_SPECS.items():
        native_path = BENCH / spec["native"]
        score_path = BENCH / spec["scores"]
        native_rows = csv_rows(native_path)
        score_rows = csv_rows(score_path)
        native_by_id = keyed(native_rows, "execution_id")
        score_by_id = keyed(score_rows, "execution_id")
        native_hash, score_hash = sha(native_path), sha(score_path)
        for case in grid_doc["cases"]:
            execution_id = str(case["executionId"])
            expected_index = int(case["rowIndex"])
            frozen = execution_by_id.get(execution_id)
            if frozen is None or int(frozen["row_index"]) != expected_index:
                raise ValueError(f"severity case does not match canonical execution row {execution_id}")
            native_record = native_by_id.get(execution_id)
            score_record = score_by_id.get(execution_id)
            if native_record is None or score_record is None:
                raise ValueError(f"{method_id} has no retained native/score row for {execution_id}")
            rank, native_row = native_record
            _, score_row = score_record
            if rank != expected_index:
                raise ValueError(f"{method_id} native mask array rank does not equal frozen row index {expected_index}")
            if int(native_row.get("row_index") or native_row.get("execution_row_index") or expected_index) != expected_index:
                raise ValueError(f"{method_id} native row index does not match {execution_id}")
            if int(score_row.get("row_index") or expected_index) != expected_index:
                raise ValueError(f"{method_id} score row index does not match {execution_id}")
            source_sha = str(case["frames"][0]["mediaHashes"]["transformedSourceSha256"]).lower()
            gt_sha = str(case["frames"][0]["mediaHashes"]["primaryGtSha256"]).lower()
            native_source_sha = str(native_row.get("image_sha256") or "").lower()
            score_source_sha = str(score_row.get("source_image_sha256") or score_row.get("image_sha256") or "").lower()
            score_gt_sha = str(score_row.get("primary_gt_sha256") or score_row.get("gt_mask_sha256") or "").lower()
            if native_source_sha != source_sha or score_source_sha != source_sha or score_gt_sha != gt_sha:
                raise ValueError(f"{method_id} row hashes do not match the exact transformed source and GT")

            source_url = str(case["frames"][0]["sourceSrc"])
            source_path = ROOT / "benchmark_site/public" / source_url.lstrip("/")
            if not source_path.is_file() or sha(source_path) != source_sha:
                raise ValueError(f"severity source asset is missing or hash-mismatched: {source_url}")
            with Image.open(source_path) as source:
                source_size = source.size
                if source_size != (int(case["frames"][0]["width"]), int(case["frames"][0]["height"])):
                    raise ValueError("severity source dimensions do not match the media manifest")
            try:
                mask = unpack_row(spec, rank, native_row, source_size)
            except ValueError as exc:
                raise ValueError(f"{method_id} execution {execution_id}: {exc}") from exc
            if mask.shape != (source_size[1], source_size[0]):
                raise ValueError(f"{method_id} prediction did not map to source raster")

            relative_url = f"/media/exact-gt/predictions/{method_id}/{execution_id}.png"
            output_path = ROOT / "benchmark_site/public" / relative_url.lstrip("/")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            if not args.verify_only:
                Image.fromarray(mask.astype(np.uint8) * 255, mode="L").save(output_path, format="PNG", optimize=False)
            if not output_path.is_file():
                raise FileNotFoundError(f"prediction mask was not staged: {relative_url}")
            with Image.open(output_path) as staged:
                if staged.size != source_size or staged.mode not in {"L", "1"}:
                    raise ValueError(f"staged mask is not a source-sized monochrome raster: {relative_url}")
                staged_mask = np.asarray(staged.convert("L")) > 0
                if not np.array_equal(staged_mask, mask):
                    raise ValueError(f"staged PNG pixels differ from native source mask: {relative_url}")
            reference = case["frames"][0]["reference"]
            gt_url = str(reference["gt"])
            gt_sha = str(case["frames"][0]["mediaHashes"]["primaryGtSha256"]).lower()
            gt_format = str(reference.get("primaryGtFormat") or "rgb_labels_yellow_pupil")
            comparison = stage_comparison(
                case_id=execution_id, method_id=method_id, row_index=expected_index,
                source_url=source_url, source_sha=source_sha,
                gt_display_url=gt_url, gt_display_sha=gt_sha,
                gt_raw_path=None, gt_raw_sha=gt_sha, gt_format=gt_format,
                gt_display_format=gt_format, prediction_url=relative_url,
                prediction_sha=sha(output_path), category="severity_grid",
                verify_only=args.verify_only,
            )
            comparisons.append(comparison)
            assets.append({
                "executionId": execution_id, "rowIndex": expected_index,
                "methodId": method_id, "methodStatus": "MEASURED_NATIVE_MASK",
                "publicPath": "benchmark_site/public" + relative_url,
                "publicUrl": relative_url, "publicSha256": sha(output_path),
                "sourceImageSha256": source_sha, "primaryGtSha256": gt_sha,
                "width": source_size[0], "height": source_size[1],
                "predictionPixelCount": int(mask.sum()),
                "nativePredictionCsvPath": str(native_path.relative_to(ROOT)), "nativePredictionCsvSha256": native_hash,
                "scoreCsvPath": str(score_path.relative_to(ROOT)), "scoreCsvSha256": score_hash,
                "nativeArrayPath": str((BENCH / spec["packed"]).resolve().relative_to(ROOT)) if spec.get("packed") else None,
                "nativeArraySha256": sha((BENCH / spec["packed"]).resolve()) if spec.get("packed") else None,
                "nativeShapeArrayPath": str((BENCH / spec["shapes"]).resolve().relative_to(ROOT)) if spec.get("shapes") else None,
                "nativeShapeArraySha256": sha((BENCH / spec["shapes"]).resolve()) if spec.get("shapes") else None,
                "nativeOutputArtifactPath": (
                    str((BENCH / "exact_gt_execution_v2_1" / str(native_row["prediction_path"])).resolve().relative_to(ROOT))
                    if spec["kind"] == "classical_npz" else
                    str((BENCH / spec["packed"]).resolve().relative_to(ROOT)) if spec.get("packed") else None
                ),
                "nativeOutputArtifactSha256": (
                    str(native_row.get("prediction_sha256") or "").lower()
                    if spec["kind"] == "classical_npz" else
                    sha((BENCH / spec["packed"]).resolve()) if spec.get("packed") else None
                ),
                "nativeRowMaskSha256": str(native_row.get("mask_128_sha256") or "").lower() or None,
                "nativeRank": rank,
                "coordinateSystem": "native pupil mask mapped to the exact transformed source raster; no additional resize except the documented nearest-neighbour native 128x128 Meye mapping",
            })

    # Add comparisons for the seven previously selected Exact-GT cases whose
    # five retained native-mask families were staged by the visual-QC worker.
    selected_media = json.loads(SELECTED_MEDIA_MANIFEST.read_text(encoding="utf-8"))
    selected_public = json.loads(SELECTED_PREDICTION_MEDIA_MANIFEST.read_text(encoding="utf-8"))
    if selected_media.get("schema") != "EXACT_GT_SELECTED_MEDIA_V1" or selected_public.get("schema") != "EXACT_GT_V21_SELECTED_PUBLIC_PREDICTION_MEDIA_HASH_MANIFEST_V1":
        raise ValueError("unexpected selected Exact-GT comparison input schema")
    selected_cases = {str(case.get("id")): case for case in selected_media.get("cases", [])}
    for asset in selected_public.get("assets", []):
        case_id = str(asset["executionId"])
        method_id = str(asset["methodId"])
        case = selected_cases.get(case_id)
        if case is None:
            raise ValueError(f"selected Exact-GT prediction asset has no matching media case {case_id}")
        frame = case["frames"][0]
        exact_gt = frame["exactGT"]
        gt_url = str(exact_gt["src"])
        display_gt_sha = str(exact_gt["pupilMaskSha256"]).lower()
        canonical_gt_path = ROOT / str(case["gtPath"])
        canonical_gt_sha = str(exact_gt["sha256"]).lower()
        source_url = str(frame["transformedSourceSrc"])
        source_sha = str(frame["transformedSourceSha256"]).lower()
        prediction_url = "/" + str(asset["publicPath"]).split("benchmark_site/public/", 1)[-1]
        comparisons.append(stage_comparison(
            case_id=case_id, method_id=method_id, row_index=int(asset["rowIndex"]),
            source_url=source_url, source_sha=source_sha,
            gt_display_url=gt_url, gt_display_sha=display_gt_sha,
            gt_raw_path=canonical_gt_path, gt_raw_sha=canonical_gt_sha,
            gt_format=str(case.get("gtFormat") or "rgb_labels_yellow_pupil"),
            gt_display_format="binary", prediction_url=prediction_url,
            prediction_sha=str(asset["publicSha256"]).lower(), category="selected_case",
            verify_only=args.verify_only,
        ))

    payload = {
        "schema": "EXACT_GT_V21_SEVERITY_PUBLIC_PREDICTION_MEDIA_V1",
        "sourceGridManifestPath": str(MEDIA_MANIFEST.relative_to(ROOT)),
        "sourceGridManifestSha256": sha(MEDIA_MANIFEST),
        "executionRowsPath": str(EXECUTION_ROWS.relative_to(ROOT)),
        "executionRowsSha256": sha(EXECUTION_ROWS),
        "selectionPolicy": "18 prediction-blind frozen Exact-GT V2.1 severity cases; only native arrays with per-row source/GT identity joins are included",
        "methodIds": list(METHOD_SPECS),
        "caseCount": len(grid_doc["cases"]),
        "assetCount": len(assets),
        "assets": assets,
    }
    if args.verify_only:
        existing = json.loads(OUT_MANIFEST.read_text(encoding="utf-8"))
        if existing != payload:
            raise ValueError("staged Exact-GT severity prediction manifest differs from the retained native output hashes")
    else:
        OUT_MANIFEST.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    comparison_payload = {
        "schema": "EXACT_GT_V21_PREDICTION_COMPARISON_MEDIA_V1",
        "severityPredictionManifestPath": str(OUT_MANIFEST.relative_to(ROOT)),
        "severityPredictionManifestSha256": sha(OUT_MANIFEST),
        "severityMediaManifestPath": str(MEDIA_MANIFEST.relative_to(ROOT)),
        "severityMediaManifestSha256": sha(MEDIA_MANIFEST),
        "selectedMediaManifestPath": str(SELECTED_MEDIA_MANIFEST.relative_to(ROOT)),
        "selectedMediaManifestSha256": sha(SELECTED_MEDIA_MANIFEST),
        "selectedPredictionManifestPath": str(SELECTED_PREDICTION_MEDIA_MANIFEST.relative_to(ROOT)),
        "selectedPredictionManifestSha256": sha(SELECTED_PREDICTION_MEDIA_MANIFEST),
        "selectionPolicy": "Pixel membership is classified from exact GT and hash-joined retained source-raster prediction masks; this does not recompute benchmark metrics.",
        "caseCount": len({item["caseId"] for item in comparisons}),
        "assetCount": len(comparisons),
        "legend": LEGEND,
        "assets": comparisons,
    }
    if args.verify_only:
        existing_comparisons = json.loads(COMPARISON_MANIFEST.read_text(encoding="utf-8"))
        if existing_comparisons != comparison_payload:
            raise ValueError("staged Exact-GT prediction comparison manifest differs from frozen inputs")
    else:
        COMPARISON_MANIFEST.write_text(json.dumps(comparison_payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"caseCount": 18, "methodCount": len(METHOD_SPECS), "assetCount": len(assets), "comparisonCaseCount": comparison_payload["caseCount"], "comparisonAssetCount": len(comparisons), "pupilGtAssetCount": pupil_gt_payload["assetCount"], "manifestSha256": sha(OUT_MANIFEST), "comparisonManifestSha256": sha(COMPARISON_MANIFEST), "pupilGtManifestSha256": sha(SEVERITY_PUPIL_GT_MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
