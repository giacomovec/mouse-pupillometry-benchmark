#!/usr/bin/env python3
"""Export a bounded, hash-verified set of real-validation website media.

Representative anchors come only from REAL_VALIDATION_VISUAL_FREEZE.json. Their
short synchronized sequences are selected by source frame order from the frozen
validation manifest. Worst-case anchors are selected separately from the
canonical real-validation summary and its linked frame-metrics tables.

No models are run and no benchmark metrics are recalculated here.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import struct
from pathlib import Path
from typing import Any


SCHEMA = "MOUSEFORMER_WEBSITE_VISUAL_MEDIA_V1"
MAX_FRAMES_PER_CASE = 5
FREEZE_REL = Path("parallel_handoffs/benchmark_expansion_20260919/REAL_VALIDATION_VISUAL_FREEZE.json")
VALIDATION_REL = Path("parallel_handoffs/acquisition_family_corrected_wave_20260915/protocol/VALIDATION.csv")
REAL_VALIDATION_DIR_REL = Path("parallel_handoffs/benchmark_expansion_20260919/real_validation_v7")
SUMMARY_NAME = "REAL_VALIDATION_SUMMARY.csv"
EVIDENCE_NAME = "REAL_VALIDATION_EVIDENCE.csv"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def checked_path(root: Path, raw: str, label: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"{label} path escapes project root: {raw}")
    if not path.is_file():
        raise FileNotFoundError(f"{label} file is missing: {path}")
    return path


def checked_directory(root: Path, path: Path, label: str) -> Path:
    path = path.resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"{label} path escapes project root: {path}")
    if not path.is_dir():
        raise FileNotFoundError(f"{label} directory is missing: {path}")
    return path


def truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "y"}


def finite_number(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        header = f.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Media source is not a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def ordered_validation_rows(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        sequence_id = row.get("candidate_sequence_id", "").strip()
        if not sequence_id:
            raise ValueError(f"Validation row has no candidate_sequence_id: {row.get('sample_id')}")
        grouped.setdefault(sequence_id, []).append(row)
    for sequence_rows in grouped.values():
        sequence_rows.sort(key=lambda r: (int(r["frame_number"]), r["sample_id"]))
    return grouped


def sequence_window(
    row: dict[str, str],
    grouped: dict[str, list[dict[str, str]]],
    max_frames: int = MAX_FRAMES_PER_CASE,
) -> list[dict[str, str]]:
    """Return a centered, source-ordered window without consulting outcomes."""
    seq = grouped[row["candidate_sequence_id"]]
    anchor_index = next(i for i, candidate in enumerate(seq) if candidate["sample_id"] == row["sample_id"])
    count = min(max_frames, len(seq))
    start = min(max(0, anchor_index - count // 2), len(seq) - count)
    return seq[start : start + count]


def public_media_copy(source: Path, expected_hash: str, folder: Path, name: str) -> str:
    actual_hash = sha256_file(source)
    if expected_hash and actual_hash != expected_hash:
        raise ValueError(f"SHA-256 mismatch for {source}: expected {expected_hash}, got {actual_hash}")
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    if target.exists() and sha256_file(target) != actual_hash:
        raise ValueError(f"Existing website media path conflicts with source hash: {target}")
    if not target.exists():
        shutil.copyfile(source, target)
    if sha256_file(target) != actual_hash:
        raise ValueError(f"Website media copy did not preserve bytes: {target}")
    return "/media/" + target.relative_to(folder.parents[1]).as_posix()


def media_record(
    root: Path,
    row: dict[str, str],
    public_media: Path,
) -> dict[str, Any]:
    source = checked_path(root, row["roi_image_path"], "scored source ROI")
    gt = checked_path(root, row["roi_mask_path"], "scored GT ROI")
    expected_dimensions = (int(row["roi_width"]), int(row["roi_height"]))
    if png_dimensions(source) != expected_dimensions:
        raise ValueError(f"Scored source ROI dimensions disagree with validation row: {source}")
    if png_dimensions(gt) != expected_dimensions:
        raise ValueError(f"Scored GT ROI dimensions disagree with validation row: {gt}")
    source_hash = row.get("roi_image_sha256", "")
    gt_hash = row.get("roi_mask_sha256", "")
    source_url = public_media_copy(
        source,
        source_hash,
        public_media / "real-validation" / "source",
        f"{source_hash}.png",
    )
    gt_url = public_media_copy(
        gt,
        gt_hash,
        public_media / "real-validation" / "gt",
        f"{gt_hash}.png",
    )
    source_full_path = checked_path(root, row["source_image_path"], "original source frame")
    gt_full_path = checked_path(root, row["source_mask_path"], "original GT frame")
    source_full_hash = row.get("source_image_sha256", "")
    gt_full_hash = row.get("source_mask_sha256", "")
    if source_full_hash and sha256_file(source_full_path) != source_full_hash:
        raise ValueError(f"Original source-frame SHA-256 mismatch: {source_full_path}")
    if gt_full_hash and sha256_file(gt_full_path) != gt_full_hash:
        raise ValueError(f"Original full-frame GT SHA-256 mismatch: {gt_full_path}")

    return {
        "sampleId": row["sample_id"],
        "frameId": row["sample_id"],
        "sourceFrameNumber": int(row["frame_number"]),
        "frameIndex": None,
        "timestampMs": None,
        "timestampStatus": "unavailable: source frame rate/timebase is not recorded in the frozen validation manifest",
        "sourcePath": row["roi_image_path"],
        "sourceHash": source_hash,
        "gtPath": row["roi_mask_path"],
        "gtHash": gt_hash,
        "reference": {
            "src": source_url,
            "gt": gt_url,
            "sourceSha256": source_hash,
            "gtSha256": gt_hash,
            "coordinateSpace": "frozen scored ROI pixels; no resampling",
        },
        "source": {
            "src": source_url,
            "sha256": source_hash,
            "width": int(row["roi_width"]),
            "height": int(row["roi_height"]),
            "coordinateSpace": "frozen scored ROI pixels; no resampling",
            "originalPath": row["source_image_path"],
            "originalSha256": source_full_hash,
        },
        "groundTruth": {
            "src": gt_url,
            "sha256": gt_hash,
            "encoding": "frozen color-coded annotation PNG",
            "originalPath": row["source_mask_path"],
            "originalSha256": gt_full_hash,
        },
        "roiTransform": {
            "originalWidth": int(row["original_width"]),
            "originalHeight": int(row["original_height"]),
            "x1Based": int(row["roi_x"]),
            "y1Based": int(row["roi_y"]),
            "width": int(row["roi_width"]),
            "height": int(row["roi_height"]),
            "description": row["crop_transform"],
        },
    }


def frame_entries(
    root: Path,
    case_anchor: dict[str, str],
    grouped: dict[str, list[dict[str, str]]],
    public_media: Path,
) -> list[dict[str, Any]]:
    selected = sequence_window(case_anchor, grouped)
    records = [media_record(root, row, public_media) for row in selected]
    for index, record in enumerate(records):
        record["frameIndex"] = index
    return records


def safe_case_fragment(text: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip())
    return text.strip("-") or "case"


def parse_cli() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="MouseFormer workspace containing the frozen benchmark inputs (default: script grandparent)",
    )
    parser.add_argument(
        "--site-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Dedicated benchmark_site project (default: script parent directory)",
    )
    parser.add_argument("--max-frames", type=int, default=MAX_FRAMES_PER_CASE)
    return parser.parse_args()


def main() -> None:
    args = parse_cli()
    root = args.project_root.resolve()
    site_root = args.site_root.resolve()
    if args.max_frames < 1:
        raise ValueError("--max-frames must be at least 1")

    freeze_path = checked_path(root, str(FREEZE_REL), "real-validation visual freeze")
    validation_path = checked_path(root, str(VALIDATION_REL), "frozen validation manifest")
    real_validation_dir = checked_directory(root, root / REAL_VALIDATION_DIR_REL, "real-validation export folder")
    summary_path = checked_path(root, str(real_validation_dir / SUMMARY_NAME), "real-validation summary")
    evidence_path = checked_path(root, str(real_validation_dir / EVIDENCE_NAME), "real-validation evidence index")
    freeze = json.loads(freeze_path.read_text(encoding="utf-8"))
    if freeze.get("schema") != "REAL_VALIDATION_VISUAL_FREEZE_V1":
        raise ValueError(f"Unexpected visual freeze schema: {freeze.get('schema')}")

    validation_rows = read_csv(validation_path)
    validation_by_id = {row["sample_id"]: row for row in validation_rows}
    if len(validation_by_id) != len(validation_rows):
        raise ValueError("Frozen validation manifest contains duplicate sample IDs")
    grouped = ordered_validation_rows(validation_rows)
    public_media = site_root / "public" / "media"
    if not public_media.is_dir():
        public_media.mkdir(parents=True, exist_ok=True)

    representative_cases: list[dict[str, Any]] = []
    for frozen in freeze["samples"]:
        sample_id = frozen["sample_id"]
        row = validation_by_id.get(sample_id)
        if row is None:
            raise ValueError(f"Frozen representative is not in validation manifest: {sample_id}")
        if row.get("component_id") != frozen.get("family"):
            raise ValueError(f"Acquisition-family mismatch for frozen representative: {sample_id}")
        if row.get("roi_image_sha256") != frozen.get("source_sha256"):
            raise ValueError(f"Frozen source hash disagrees with validation row: {sample_id}")
        if row.get("roi_mask_sha256") != frozen.get("GT_sha256"):
            raise ValueError(f"Frozen GT hash disagrees with validation row: {sample_id}")
        frames = frame_entries(root, row, grouped, public_media)
        representative_cases.append(
            {
                "caseId": sample_id,
                "id": sample_id,
                "label": f"{frozen['family']} · {frozen['size_stratum']} · prediction-blind representative",
                "mode": "representative",
                "sourceId": row["candidate_sequence_id"],
                "sourcePath": row["roi_image_path"],
                "sourceHash": row["roi_image_sha256"],
                "sourceFullFrameHash": row["source_image_sha256"],
                "family": frozen["family"],
                "sizeStratum": frozen["size_stratum"],
                "difficultyProxyFlags": frozen["difficulty_proxy_flags"],
                "selection": {
                    "source": "REAL_VALIDATION_VISUAL_FREEZE_V1",
                    "frozenAnchorSampleId": sample_id,
                    "frozenAnchorSourceSha256": frozen["source_sha256"],
                    "frozenAnchorGTSha256": frozen["GT_sha256"],
                    "rule": "one deterministic SHA256-minimum sample per within-family pupil-area tertile; SOURCE+GT only",
                    "sequenceContextRule": f"up to {args.max_frames} nearest validation rows from the same candidate_sequence_id, centered on the anchor and ordered by source frame number; no prediction or error fields read",
                    "representative": True,
                    "outcomeSelected": False,
                },
                "frameIds": [frame["sampleId"] for frame in frames],
                "timestampsMs": [None for _ in frames],
                "frames": frames,
            }
        )

    summary_rows = read_csv(summary_path)
    evidence_rows = read_csv(evidence_path)
    evidence_by_id = {row["evidence_id"]: row for row in evidence_rows}
    worst_case_triggers: dict[tuple[str, str], list[dict[str, Any]]] = {}
    selected_source_rows: dict[str, dict[str, str]] = {}
    score_tables: dict[str, str] = {}
    for summary in summary_rows:
        evidence = evidence_by_id.get(summary["evidence_id"])
        if evidence is None:
            raise ValueError(f"No evidence record for summary row {summary['evidence_id']}")
        metric_path = checked_path(root, evidence["frame_metrics_path"], "canonical frame-metrics table")
        score_tables[str(metric_path.relative_to(root))] = sha256_file(metric_path)
        metric_rows = read_csv(metric_path)
        if not metric_rows:
            raise ValueError(f"Canonical frame-metrics table is empty: {metric_path}")
        metric_col = next(
            (name for name in ("equivalent_diameter_are", "diameter_are", "diameter_relative_error") if name in metric_rows[0]),
            None,
        )
        retained_col = next(
            (name for name in ("retained", "score_selected_retained", "primary_retained") if name in metric_rows[0]),
            None,
        )
        if not metric_col or not retained_col:
            raise ValueError(f"Could not locate diameter error and retained fields in {metric_path}")
        eligible = [
            (finite_number(row.get(metric_col)), row)
            for row in metric_rows
            if truthy(row.get(retained_col)) and truthy(row.get("valid")) and row.get("sample_id") in validation_by_id
        ]
        eligible = [(value, row) for value, row in eligible if value is not None]
        if not eligible:
            continue
        max_error = max(value for value, _ in eligible if value is not None)
        worst_value, worst_row = min(
            ((value, row) for value, row in eligible if value == max_error),
            key=lambda pair: pair[1]["sample_id"],
        )
        sample_id = worst_row["sample_id"]
        selected_source_rows[sample_id] = validation_by_id[sample_id]
        method_id = summary["method_id"]
        key = (method_id, sample_id)
        worst_case_triggers.setdefault(key, []).append(
            {
                "plane": summary["plane"],
                "methodId": method_id,
                "condition": summary["condition"],
                "representation": summary["representation"],
                "truthView": summary["truth_view"],
                "metric": metric_col,
                "metricValue": worst_value,
                "retainedRule": retained_col,
            }
        )

    worst_cases: list[dict[str, Any]] = []
    for (method_id, sample_id), triggers in sorted(worst_case_triggers.items()):
        source_row = validation_by_id[sample_id]
        frames = frame_entries(root, source_row, grouped, public_media)
        case_id = f"wc-{safe_case_fragment(method_id)}-{safe_case_fragment(sample_id)}"
        worst_cases.append(
            {
                "caseId": case_id,
                "id": case_id,
                "label": f"Outcome-selected QC example · {method_id} · max retained diameter error",
                "mode": "worst_case",
                "sourceId": source_row["candidate_sequence_id"],
                "sourcePath": source_row["roi_image_path"],
                "sourceHash": source_row["roi_image_sha256"],
                "sourceFullFrameHash": source_row["source_image_sha256"],
                "family": source_row["component_id"],
                "sizeStratum": source_row["pupil_size_stratum"],
                "difficultyProxyFlags": source_row["difficulty_proxy_flags"],
                "selection": {
                    "source": "REAL_VALIDATION_SUMMARY.csv and its linked canonical FRAME_METRICS.csv",
                    "triggers": triggers,
                    "rule": "max finite diameter ARE among valid, primary-retained rows for each canonical method/plane; ties broken by sample_id",
                    "representative": False,
                    "outcomeSelected": True,
                    "displayLabel": "Outcome-selected QC examples — not representative.",
                },
                "triggerMethodIds": [method_id],
                "frameIds": [frame["sampleId"] for frame in frames],
                "timestampsMs": [None for _ in frames],
                "frames": frames,
            }
        )

    ids = [case["caseId"] for case in representative_cases + worst_cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Case IDs are not unique")

    manifest = {
        "schema": SCHEMA,
        "benchmarkVersion": "ACQUISITION_FAMILY_CORRECTED_DEV_V1",
        "createdFrom": {
            "representativeFreeze": {
                "path": FREEZE_REL.as_posix(),
                "sha256": sha256_file(freeze_path),
                "schema": freeze["schema"],
            },
            "validationManifest": {
                "path": VALIDATION_REL.as_posix(),
                "sha256": sha256_file(validation_path),
            },
            "realValidationSummary": {
                "path": (REAL_VALIDATION_DIR_REL / SUMMARY_NAME).as_posix(),
                "sha256": sha256_file(summary_path),
            },
            "realValidationEvidenceIndex": {
                "path": (REAL_VALIDATION_DIR_REL / EVIDENCE_NAME).as_posix(),
                "sha256": sha256_file(evidence_path),
            },
            "canonicalFrameMetricsSha256": score_tables,
        },
        "mediaPolicy": {
            "representation": "exact canonical scored ROI source and color-coded GT PNGs",
            "roiDimensions": "source and GT remain in their original frozen scored ROI pixel coordinates; no resize or resampling",
            "timebase": "timestampMs is null because the frozen validation manifest does not provide an acquisition FPS/timebase; sourceFrameNumber is retained",
            "playback": "ordered synchronized frame slideshow; original frame-number gaps are preserved",
            "publicMediaRoot": "/media/real-validation/",
            "h264VideoIncluded": False,
            "protectedOrAllenMaterialIncluded": False,
        },
        "selectionPolicy": {
            "representative": "prediction-blind seeds from the frozen source/GT atlas; each clip context is selected by source frame order from the same validation candidate_sequence_id",
            "worstCase": "separate outcome-selected set; one maximum retained equivalent-diameter ARE frame per canonical method/plane, with selection source and metric value recorded",
        },
        "counts": {
            "representativeCases": len(representative_cases),
            "representativeFrames": sum(len(case["frames"]) for case in representative_cases),
            "worstCaseMethodPlaneRows": sum(len(triggers) for triggers in worst_case_triggers.values()),
            "worstCaseCases": len(worst_cases),
            "worstCaseUniqueAnchorSamples": len(selected_source_rows),
            "worstCaseFrames": sum(len(case["frames"]) for case in worst_cases),
            "uniqueScoredSourceFrames": len({frame["source"]["sha256"] for case in representative_cases + worst_cases for frame in case["frames"]}),
            "uniqueScoredGTFrames": len({frame["groundTruth"]["sha256"] for case in representative_cases + worst_cases for frame in case["frames"]}),
        },
        "cases": representative_cases + worst_cases,
    }
    manifest_path = site_root / "media_export" / "website_visual_media_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    source_media = list((public_media / "real-validation" / "source").glob("*.png"))
    gt_media = list((public_media / "real-validation" / "gt").glob("*.png"))
    total_bytes = sum(p.stat().st_size for p in source_media + gt_media)
    print(json.dumps({
        "manifest": str(manifest_path),
        "cases": len(manifest["cases"]),
        "representativeCases": manifest["counts"]["representativeCases"],
        "representativeFrames": manifest["counts"]["representativeFrames"],
        "worstCaseMethodPlaneRows": manifest["counts"]["worstCaseMethodPlaneRows"],
        "worstCaseCases": manifest["counts"]["worstCaseCases"],
        "worstCaseUniqueAnchorSamples": manifest["counts"]["worstCaseUniqueAnchorSamples"],
        "uniqueSourcePngs": len(source_media),
        "uniqueGTPngs": len(gt_media),
        "mediaBytes": total_bytes,
        "allTimestampsNull": all(frame["timestampMs"] is None for case in manifest["cases"] for frame in case["frames"]),
    }, indent=2))


if __name__ == "__main__":
    main()
