#!/usr/bin/env python3
"""Export a bounded Exact-GT V2.2 temporal visual case bundle for the site.

This reads only the frozen temporal source/truth bundles and frozen native
prediction / sequence-score outputs. PNGs are copied byte-for-byte under
content-addressed names; no model inference, interpolation, resizing, or
canonical score-table edits are performed.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import shutil
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any


WORKSPACE = Path(__file__).resolve().parents[2]
CORPUS_REL = Path(
    "parallel_handoffs/benchmark_expansion_20260919/"
    "EXACT_GT_V2_2_TEMPORAL_MULTI_SEED"
)
RESULTS_REL = Path("parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results")
PUBLIC_MEDIA_REL = Path("benchmark_site/public/media/temporal/exact-gt-v2.2")
PUBLIC_ASSET_REL = Path("media/temporal/exact-gt-v2.2")
OUTPUT_REL = Path("benchmark_site/media_export/temporal_visual_cases_v1.json")
SEEDS = ("TMS02", "TMS07")
SEQUENCE = "diameter_sine"
FRAME_COUNT = 96
COORDINATE_SPACE = "Exact-GT source image pixels"


@dataclass(frozen=True)
class MethodSource:
    method_id: str
    native_csv: str | None
    score_csv: str
    geometry_replay_audit: str | None = None


METHOD_SOURCES = (
    MethodSource(
        "mouse_pupil_analysis_v020",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "mouse_pupil_analysis_v020/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "mouse-pupil-analysis-v0.2.0_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "segformer_b0",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "segformer_b0/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "b0_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "segformer_b1",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "segformer_b1/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "b1_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "segformer_b2",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "segformer_b2/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "b2_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "unet_small",
        None,
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "small_scored_v2/SEQUENCE_METRICS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/closure_unet_temporal_v22/"
        "collected/small/NATIVE_GEOMETRY_REPLAY.json",
    ),
    MethodSource(
        "unet_base",
        None,
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "base_scored_v2/SEQUENCE_METRICS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/closure_unet_temporal_v22/"
        "collected/base/NATIVE_GEOMETRY_REPLAY.json",
    ),
    MethodSource(
        "unet_b2_matched",
        None,
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "b2_matched_scored_v2/SEQUENCE_METRICS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/closure_unet_temporal_v22/"
        "collected/b2_matched/NATIVE_GEOMETRY_REPLAY.json",
    ),
    MethodSource(
        "meye_released",
        "parallel_handoffs/benchmark_expansion_20260919/closure_meye_temporal_v22/"
        "collected/meye_released_v22/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "meye_released_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "meye_matched",
        "parallel_handoffs/benchmark_expansion_20260919/closure_meye_matched_temporal_v22/"
        "results/meye_matched_temporal_v22/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/closure_meye_matched_temporal_v22/"
        "scored/meye_matched_temporal_v22/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "standard_dlc_matched",
        "parallel_handoffs/benchmark_expansion_20260919/closure_standard_dlc_temporal_v22/"
        "results/standard_dlc_v22/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "standard_dlc_matched_scored_v2/SEQUENCE_METRICS.csv",
    ),
    MethodSource(
        "pupil_dlc_gm",
        "parallel_handoffs/benchmark_expansion_20260919/closure_pupil_dlc_gm_temporal_v22/"
        "results/pupil_dlc_gm_temporal_v22/NATIVE_PREDICTIONS.csv",
        "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/"
        "pupil_dlc_gm_scored_v2/SEQUENCE_METRICS.csv",
    ),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        header = stream.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG with a valid IHDR: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError(f"Cannot parse boolean value: {value!r}")


def number_or_none(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite source number: {value!r}")
    return number


def copy_hashed_png(source: Path, media_kind: str, expected_hash: str) -> str:
    actual_hash = sha256(source)
    if actual_hash != expected_hash:
        raise ValueError(f"Hash mismatch for {source}: {actual_hash} != {expected_hash}")
    relative = PUBLIC_ASSET_REL / media_kind / f"{actual_hash}.png"
    target = WORKSPACE / "benchmark_site" / "public" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if sha256(target) != actual_hash:
            raise ValueError(f"Content-addressed asset already exists with wrong bytes: {target}")
    else:
        shutil.copyfile(source, target)
        if sha256(target) != actual_hash:
            raise ValueError(f"Copied asset failed hash verification: {target}")
    return "/" + relative.as_posix()


def method_geometry(row: dict[str, str]) -> dict[str, Any]:
    x = number_or_none(row.get("center_x_px"))
    y = number_or_none(row.get("center_y_px"))
    diameter = number_or_none(row.get("equivalent_diameter_px"))
    area = number_or_none(row.get("area_px2"))
    major = number_or_none(row.get("major_axis_px"))
    minor = number_or_none(row.get("minor_axis_px"))
    angle = number_or_none(row.get("orientation_rad"))
    if angle is None:
        angle = number_or_none(row.get("angle_rad"))
    if x is None or y is None or diameter is None:
        raise ValueError("A valid native frame row is missing center or equivalent diameter")
    ellipse: dict[str, Any] = {
        "cx": x,
        "cy": y,
        "major": major,
        "minor": minor,
        "orientationAvailable": angle is not None,
    }
    if angle is not None:
        ellipse["angleRad"] = angle
    return {
        "center": {"x": x, "y": y},
        "ellipse": ellipse,
        "diameter": diameter,
        "area": area,
        "orientationAvailable": angle is not None,
        "coordinateSpace": COORDINATE_SPACE,
    }


def gt_geometry(truth: dict[str, Any]) -> dict[str, Any]:
    raster = truth["raster"]
    center_x = float(raster["center_x_px"])
    center_y = float(raster["center_y_px"])
    orientation_available = bool(raster["orientation_defined"])
    ellipse: dict[str, Any] = {
        "cx": center_x,
        "cy": center_y,
        "major": float(raster["major_axis_px"]),
        "minor": float(raster["minor_axis_px"]),
        "orientationAvailable": orientation_available,
        "angleSource": "frozen analytic target orientation",
    }
    if orientation_available:
        ellipse["angleRad"] = float(truth["analytic_orientation_rad"])
    return {
        "center": {"x": center_x, "y": center_y},
        "ellipse": ellipse,
        "diameter": float(raster["equivalent_diameter_px"]),
        "area": float(raster["area_px2"]),
        "orientationAvailable": orientation_available,
        "orientationSource": "frozen analytic target angle; exact visible raster for center, axes, area and diameter",
        "coordinateSpace": COORDINATE_SPACE,
    }


def summary_for(path: Path, seed: str) -> dict[str, Any]:
    rows = read_csv(path)
    matching = [
        row for row in rows
        if row.get("seed_id") == seed and row.get("sequence_id") == SEQUENCE
    ]
    if len(matching) != 1:
        raise ValueError(f"Expected exactly one score summary for {seed}/{SEQUENCE} in {path}, found {len(matching)}")
    row = matching[0]
    number_fields = (
        "scorable_frames",
        "valid_frames",
        "abstained_scorable_frames",
        "missing_input_frames",
        "occluded_frames",
        "coverage",
        "diameter_trajectory_rmse_px",
    )
    parsed: dict[str, Any] = {}
    for name in number_fields:
        if row.get(name, "").strip() == "":
            parsed[name] = None
        elif name.endswith("_frames"):
            parsed[name] = int(float(row[name]))
        else:
            parsed[name] = float(row[name])
    return parsed


def build_manifest() -> dict[str, Any]:
    corpus = WORKSPACE / CORPUS_REL
    corpus_manifest_path = corpus / "MANIFEST.json"
    execution_freeze_path = corpus / "EXECUTION_FREEZE.json"
    independent_audit_path = corpus / "INDEPENDENT_AUDIT.json"
    input_path = corpus / "INPUT_STREAM.jsonl"
    truth_path = corpus / "TRUTH.jsonl"
    corpus_manifest = json.loads(corpus_manifest_path.read_text(encoding="utf-8"))
    execution_freeze = json.loads(execution_freeze_path.read_text(encoding="utf-8"))
    independent_audit = json.loads(independent_audit_path.read_text(encoding="utf-8"))
    corpus_manifest_hash = sha256(corpus_manifest_path)
    input_hash = sha256(input_path)
    truth_hash = sha256(truth_path)
    independent_audit_hash = sha256(independent_audit_path)
    if execution_freeze["corpus_manifest_sha256"] != corpus_manifest_hash:
        raise ValueError("Corpus manifest hash differs from frozen execution manifest")
    if execution_freeze["input_stream_sha256"] != input_hash:
        raise ValueError("Input stream hash differs from frozen execution manifest")
    if execution_freeze["truth_sha256"] != truth_hash:
        raise ValueError("Truth hash differs from frozen execution manifest")
    if execution_freeze["independent_audit_sha256"] != independent_audit_hash:
        raise ValueError("Independent audit hash differs from frozen execution manifest")
    if independent_audit.get("status") != "PASS":
        raise ValueError("Frozen independent audit did not pass")

    input_rows = read_jsonl(input_path)
    truth_rows = read_jsonl(truth_path)
    input_by_key = {
        (row["seed_id"], row["sequence_id"], int(row["frame_index"])): row
        for row in input_rows
        if row["seed_id"] in SEEDS and row["sequence_id"] == SEQUENCE
    }
    truth_by_key = {
        (row["seed_id"], row["sequence_id"], int(row["frame_index"])): row
        for row in truth_rows
        if row["seed_id"] in SEEDS and row["sequence_id"] == SEQUENCE
    }
    expected_keys = {
        (seed, SEQUENCE, frame_index)
        for seed in SEEDS
        for frame_index in range(FRAME_COUNT)
    }
    if set(input_by_key) != expected_keys:
        raise ValueError(f"Input stream keys differ from expected sequential frame set: {len(input_by_key)}")
    if set(truth_by_key) != expected_keys:
        raise ValueError(f"Truth keys differ from expected sequential frame set: {len(truth_by_key)}")

    native_maps: dict[str, dict[tuple[str, str, int], dict[str, str]]] = {}
    native_meta: dict[str, dict[str, Any]] = {}
    summary_meta: dict[str, dict[str, Any]] = {}
    for spec in METHOD_SOURCES:
        score_path = WORKSPACE / spec.score_csv
        if not score_path.is_file():
            raise FileNotFoundError(f"Missing frozen sequence score summary: {score_path}")
        summary_meta[spec.method_id] = {
            "path": spec.score_csv,
            "sha256": sha256(score_path),
        }
        if spec.native_csv is None:
            native_maps[spec.method_id] = {}
            audit_path = WORKSPACE / (spec.geometry_replay_audit or "")
            if not audit_path.is_file():
                raise FileNotFoundError(f"Missing native geometry replay audit: {audit_path}")
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            if audit.get("status") != "PASS":
                raise ValueError(f"Geometry replay audit did not pass: {audit_path}")
            native_meta[spec.method_id] = {
                "path": None,
                "sha256": None,
                "rowCount": 0,
                "geometryReplayAudit": spec.geometry_replay_audit,
                "geometryReplayAuditSha256": sha256(audit_path),
                "geometryReplayAuditSchema": audit.get("schema"),
                "geometryReplayRows": audit.get("rows_replayed"),
            }
            continue

        native_path = WORKSPACE / spec.native_csv
        if not native_path.is_file():
            raise FileNotFoundError(f"Missing frozen native prediction rows: {native_path}")
        rows = read_csv(native_path)
        native_index: dict[tuple[str, str, int], dict[str, str]] = {}
        for row in rows:
            if row.get("seed_id") not in SEEDS or row.get("sequence_id") != SEQUENCE:
                continue
            key = (row["seed_id"], row["sequence_id"], int(row["frame_index"]))
            if key in native_index:
                raise ValueError(f"Duplicate native prediction key for {spec.method_id}: {key}")
            native_index[key] = row
        if set(native_index) != expected_keys:
            raise ValueError(f"Native prediction keys do not cover the exact selected sequence set: {spec.method_id}")
        native_maps[spec.method_id] = native_index
        native_meta[spec.method_id] = {
            "path": spec.native_csv,
            "sha256": sha256(native_path),
            "rowCount": len(rows),
        }

    cases: list[dict[str, Any]] = []
    for seed in SEEDS:
        frames: list[dict[str, Any]] = []
        per_method = {
            spec.method_id: {
                "status": "UNAVAILABLE" if spec.native_csv is None else "FRAME_ROWS_PRESENT",
                "frameRowsAvailable": 0 if spec.native_csv is None else 0,
                "acceptedFrames": 0,
                "abstainedFrames": 0,
                "sequenceMetrics": summary_for(WORKSPACE / spec.score_csv, seed),
                "sequenceMetricSource": summary_meta[spec.method_id],
            }
            for spec in METHOD_SOURCES
        }
        residuals: dict[str, list[float]] = {spec.method_id: [] for spec in METHOD_SOURCES}

        for frame_index in range(FRAME_COUNT):
            key = (seed, SEQUENCE, frame_index)
            source_row = input_by_key[key]
            truth = truth_by_key[key]
            if source_row["input_policy"] != "FRAME_INPUT" or not source_row["observed"]:
                raise ValueError(f"Selected sequence contains an unobserved frame: {key}")
            if not truth["observed"] or truth["input_policy"] != "FRAME_INPUT":
                raise ValueError(f"Selected truth row does not describe an observed input: {key}")
            if source_row["image_path"] != truth["image_path"] or source_row["image_sha256"] != truth["image_sha256"]:
                raise ValueError(f"Input/truth source identity mismatch: {key}")
            if source_row["source_sample_id"] != truth["source_sample_id"]:
                raise ValueError(f"Input/truth source sample ID mismatch: {key}")
            timestamp_sec = float(source_row["timestamp_sec"])
            if not math.isclose(timestamp_sec, float(truth["timestamp_sec"]), rel_tol=0, abs_tol=1e-12):
                raise ValueError(f"Input/truth timestamp mismatch: {key}")

            image_path = WORKSPACE / source_row["image_path"]
            visible_path = WORKSPACE / truth["gt_visible_path"]
            latent_path = WORKSPACE / truth["gt_latent_path"]
            width, height = png_dimensions(image_path)
            if png_dimensions(visible_path) != (width, height) or png_dimensions(latent_path) != (width, height):
                raise ValueError(f"Source and GT PNG dimensions do not match for {key}")
            image_url = copy_hashed_png(image_path, "source", source_row["image_sha256"])
            visible_url = copy_hashed_png(visible_path, "gt", truth["gt_visible_sha256"])
            latent_url = copy_hashed_png(latent_path, "gt", truth["gt_latent_sha256"])

            reference = {
                "src": image_url,
                "image": image_url,
                "gt": visible_url,
                "latentGt": latent_url,
                "geometry": gt_geometry(truth),
                "coordinateSpace": COORDINATE_SPACE,
                "sourceSha256": source_row["image_sha256"],
                "gtSha256": truth["gt_visible_sha256"],
                "latentGtSha256": truth["gt_latent_sha256"],
                "truthPlane": truth["truth_plane"],
            }
            method_rows: dict[str, Any] = {}
            for spec in METHOD_SOURCES:
                score_info = summary_meta[spec.method_id]
                native_info = native_meta[spec.method_id]
                row = native_maps[spec.method_id].get(key)
                if row is None:
                    metric_summary = per_method[spec.method_id]["sequenceMetrics"]
                    audit_detail = native_info.get("geometryReplayAudit")
                    unavailable_reason = (
                        "No frozen per-frame prediction row is exported for this method. "
                        "A sequence-level score and summary-only geometry replay audit exist; "
                        "per-frame acceptance and geometry cannot be recovered from those summaries."
                    )
                    method_rows[spec.method_id] = {
                        "accepted": None,
                        "confidence": None,
                        "rejectionReason": None,
                        "geometry": None,
                        "predictionMask": None,
                        "values": {
                            "diameterTrajectoryPx": None,
                            "diameterResidualPx": None,
                        },
                        "provenance": {
                            "nativePredictionRows": None,
                            "nativePredictionRowsSha256": None,
                            "nativeRowIndex": None,
                            "sequenceMetricSource": score_info["path"],
                            "sequenceMetricSha256": score_info["sha256"],
                            "geometryReplayAudit": audit_detail,
                            "geometryReplayAuditSha256": native_info.get("geometryReplayAuditSha256"),
                            "sequenceMetrics": metric_summary,
                        },
                        "status": "UNAVAILABLE",
                        "unavailableReason": unavailable_reason,
                    }
                    continue

                if row.get("image_sha256") != source_row["image_sha256"]:
                    raise ValueError(f"Native prediction source hash does not join to frozen input: {spec.method_id} {key}")
                if int(row["row_index"]) != int(source_row["row_index"]):
                    raise ValueError(f"Native prediction row index does not join to frozen input: {spec.method_id} {key}")
                if row.get("source_sample_id") != source_row.get("source_sample_id"):
                    raise ValueError(f"Native prediction source sample does not join to frozen input: {spec.method_id} {key}")
                if row.get("acquisition_family_id") != source_row.get("acquisition_family_id"):
                    raise ValueError(f"Native prediction family does not join to frozen input: {spec.method_id} {key}")
                if "image_path" in row and row["image_path"] and row["image_path"] != source_row["image_path"]:
                    raise ValueError(f"Native prediction image path does not join to frozen input: {spec.method_id} {key}")
                row_timestamp = number_or_none(row.get("timestamp_sec"))
                if row_timestamp is not None and not math.isclose(row_timestamp, timestamp_sec, rel_tol=0, abs_tol=1e-12):
                    raise ValueError(f"Native prediction timestamp does not join to frozen input: {spec.method_id} {key}")
                if as_bool(row.get("observed")) != as_bool(source_row["observed"]):
                    raise ValueError(f"Native prediction observation state does not join to frozen input: {spec.method_id} {key}")

                accepted = as_bool(row.get("valid"))
                if accepted:
                    geometry = method_geometry(row)
                    diameter = float(geometry["diameter"])
                    residual = diameter - float(truth["raster"]["equivalent_diameter_px"])
                    residuals[spec.method_id].append(residual)
                    per_method[spec.method_id]["acceptedFrames"] += 1
                    per_method[spec.method_id]["frameRowsAvailable"] += 1
                    status = "MEASURED"
                    rejection_reason = None
                else:
                    geometry = None
                    diameter = None
                    residual = None
                    per_method[spec.method_id]["abstainedFrames"] += 1
                    per_method[spec.method_id]["frameRowsAvailable"] += 1
                    status = "ABSTAINED"
                    rejection_reason = row.get("abstention_reason") or None
                confidence = number_or_none(row.get("native_confidence"))
                method_rows[spec.method_id] = {
                    "accepted": accepted,
                    "confidence": confidence,
                    "rejectionReason": rejection_reason,
                    "geometry": geometry,
                    "predictionMask": None,
                    "values": {
                        "diameterTrajectoryPx": diameter,
                        "diameterResidualPx": residual,
                    },
                    "provenance": {
                        "nativePredictionRows": native_info["path"],
                        "nativePredictionRowsSha256": native_info["sha256"],
                        "nativeRowIndex": int(row["row_index"]),
                        "sequenceMetricSource": score_info["path"],
                        "sequenceMetricSha256": score_info["sha256"],
                        "scoreSummaryDiameterTrajectoryRmsePx": per_method[spec.method_id]["sequenceMetrics"]["diameter_trajectory_rmse_px"],
                        "residualDefinition": "native equivalent_diameter_px minus Exact-GT visible raster equivalent_diameter_px; framewise display value derived without smoothing or interpolation",
                    },
                    "status": status,
                    "unavailableReason": None,
                }

            source_sample_id = source_row["source_sample_id"]
            frames.append({
                "frameIndex": frame_index,
                "timestampMs": timestamp_sec * 1000.0,
                "sourceFrameNumber": frame_index,
                "width": width,
                "height": height,
                "sourceSrc": image_url,
                "sourceId": source_sample_id,
                "perturbation": SEQUENCE,
                "reference": reference,
                "methods": method_rows,
                "mediaHashes": {
                    "sourceSha256": source_row["image_sha256"],
                    "gtVisibleSha256": truth["gt_visible_sha256"],
                    "gtLatentSha256": truth["gt_latent_sha256"],
                },
            })

        method_summaries: dict[str, Any] = {}
        for spec in METHOD_SOURCES:
            detail = per_method[spec.method_id]
            metrics = detail["sequenceMetrics"]
            if spec.native_csv is not None:
                if detail["frameRowsAvailable"] != FRAME_COUNT:
                    raise ValueError(f"Native rows missing from a selected sequence: {spec.method_id}/{seed}")
                if metrics["valid_frames"] != detail["acceptedFrames"]:
                    raise ValueError(f"Native per-frame acceptance count disagrees with frozen sequence score: {spec.method_id}/{seed}")
                if metrics["abstained_scorable_frames"] != detail["abstainedFrames"]:
                    raise ValueError(f"Native abstention count disagrees with frozen sequence score: {spec.method_id}/{seed}")
                summary_rmse = metrics["diameter_trajectory_rmse_px"]
                if residuals[spec.method_id]:
                    display_rmse = math.sqrt(sum(value * value for value in residuals[spec.method_id]) / len(residuals[spec.method_id]))
                    if summary_rmse is None or not math.isclose(display_rmse, summary_rmse, rel_tol=1e-12, abs_tol=1e-12):
                        raise ValueError(f"Derived per-frame diameter residual RMSE disagrees with frozen score: {spec.method_id}/{seed}")
                elif summary_rmse is not None:
                    raise ValueError(f"No accepted native rows but score summary has finite RMSE: {spec.method_id}/{seed}")
            method_summaries[spec.method_id] = {
                **detail,
                "source": native_meta[spec.method_id],
                "summarySource": summary_meta[spec.method_id],
            }

        first_input = input_by_key[(seed, SEQUENCE, 0)]
        case = {
            "id": f"exact-gt-v22-{seed.lower()}-{SEQUENCE.replace('_', '-')}",
            "label": (
                f"{seed} · {SEQUENCE} · 96 frozen frames · 60 fps"
                if seed == "TMS02"
                else f"{seed} · {SEQUENCE} · conditional Pupil-DLC coverage example · 96 frozen frames"
            ),
            "mode": "representative" if seed == "TMS02" else "conditional_example",
            "representative": seed == "TMS02",
            "outcomeSelected": False,
            "category": "temporal",
            "sourceId": first_input["source_sample_id"],
            "sourceHash": first_input["image_sha256"],
            "seedId": seed,
            "sequenceId": SEQUENCE,
            "perturbationType": SEQUENCE,
            "parameters": corpus_manifest["expected_signals"][SEQUENCE],
            "sourcePopulation": "Exact-GT V2.2 frozen multi-seed synthetic temporal corpus",
            "selectionPolicy": (
                "Prompt-selected primary seed TMS02 diameter_sine sequence; complete 96-frame sequence retained."
                if seed == "TMS02"
                else "Conditional audit example selected because Pupil-DLC GM has valid frozen framewise outputs on this seed/sequence; label and method coverage remain explicit."
            ),
            "sourceFreeze": {
                "corpusManifest": str(CORPUS_REL / "MANIFEST.json"),
                "corpusManifestSha256": corpus_manifest_hash,
                "executionFreeze": str(CORPUS_REL / "EXECUTION_FREEZE.json"),
                "executionFreezeSha256": sha256(execution_freeze_path),
                "inputStream": str(CORPUS_REL / "INPUT_STREAM.jsonl"),
                "inputStreamSha256": input_hash,
                "truth": str(CORPUS_REL / "TRUTH.jsonl"),
                "truthSha256": truth_hash,
                "independentAudit": str(CORPUS_REL / "INDEPENDENT_AUDIT.json"),
                "independentAuditSha256": independent_audit_hash,
            },
            "timebase": {
                "fps": float(corpus_manifest["fps"]),
                "timestampSource": "frozen INPUT_STREAM.jsonl timestamp_sec, converted to milliseconds",
                "interpolation": "none",
            },
            "diameterResidualDefinition": "native per-frame equivalent_diameter_px minus exact visible-raster equivalent_diameter_px; display derivation only, no smoothing or interpolation",
            "methodAvailability": method_summaries,
            "frames": frames,
        }
        cases.append(case)

    return {
        "schema": "mouse-pupillometry-benchmark-temporal-media-export.v1",
        "schemaVersion": 1,
        "generatedBy": "benchmark_site/media_export/export_temporal_media.py",
        "sourceCorpus": str(CORPUS_REL),
        "boundedMediaRoot": "/media/temporal/exact-gt-v2.2/",
        "methodIds": [spec.method_id for spec in METHOD_SOURCES],
        "frameCountPerCase": FRAME_COUNT,
        "assetPolicy": "Byte-exact content-addressed PNG copies; original image dimensions; source and visible/latent GT only; no predicted masks copied.",
        "cases": cases,
    }


def main() -> None:
    output_path = WORKSPACE / OUTPUT_REL
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest()
    text = json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    output_path.write_text(text, encoding="utf-8")
    files = [path for path in (WORKSPACE / "benchmark_site/public/media/temporal").rglob("*.png")]
    print(json.dumps({
        "manifest": str(OUTPUT_REL),
        "cases": [
            {
                "id": case["id"],
                "seedId": case["seedId"],
                "sequenceId": case["sequenceId"],
                "frames": len(case["frames"]),
                "methods": {
                    method_id: {
                        "frameRowsAvailable": detail["frameRowsAvailable"],
                        "acceptedFrames": detail["acceptedFrames"],
                        "abstainedFrames": detail["abstainedFrames"],
                    }
                    for method_id, detail in case["methodAvailability"].items()
                },
            }
            for case in manifest["cases"]
        ],
        "pngAssetCount": len(files),
        "manifestBytes": output_path.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
