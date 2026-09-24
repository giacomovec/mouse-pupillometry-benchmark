#!/usr/bin/env python3
"""Export 18 frozen Exact-GT V2.1 spatial severity examples for the site.

Selection is based only on the corrected corpus manifest and frozen execution
rows. This script copies frozen PNG bytes and emits provenance; it does not
generate perturbations, read model predictions, or calculate scores.
"""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any


WORKSPACE = Path(__file__).resolve().parents[2]
CORPUS_REL = Path(
    "parallel_handoffs/benchmark_expansion_20260919/"
    "exact_gt_expansion_v2_1_corrected/EXACT_GT_V2_1_CORRECTED"
)
CORPUS_MANIFEST_REL = CORPUS_REL / "EXACT_GT_V2_1_CORRECTED_MANIFEST.json"
EXECUTION_ROWS_REL = Path(
    "parallel_handoffs/benchmark_expansion_20260919/"
    "exact_gt_execution_v2_1/EXACT_GT_V2_1_EXECUTION_ROWS.csv"
)
ORIGINAL_SOURCE_REL = Path(
    "remote_runs/FIG2_ROI_CORRECTION_20260911/roi_domain/fullFrames"
)
PUBLIC_MEDIA_REL = Path("benchmark_site/public/media/exact-gt/severity-grid")
PUBLIC_ASSET_REL = Path("media/exact-gt/severity-grid")
OUTPUT_REL = Path("benchmark_site/media_export/exact_gt_v21_severity_grid_v1.json")
REQUIRED_FAMILIES = ("motion_blur", "crop_truncation", "latent_occlusion", "combined_pupil")
FAMILY_ORDER = {family: index for index, family in enumerate(REQUIRED_FAMILIES)}
EDGE_ORDER = {"left": 0, "right": 1, "top": 2, "bottom": 3}
VISIBLE_FRACTIONS = (0.75, 0.5, 0.25)


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
    return struct.unpack(">II", header[16:24])


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def copy_hashed_png(source: Path, media_kind: str, expected_hash: str) -> tuple[str, int, int]:
    actual_hash = sha256(source)
    if actual_hash != expected_hash:
        raise ValueError(f"Frozen media hash mismatch: {source} {actual_hash} != {expected_hash}")
    relative_url = PUBLIC_ASSET_REL / media_kind / f"{actual_hash}.png"
    target = WORKSPACE / "benchmark_site" / "public" / relative_url
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if sha256(target) != actual_hash:
            raise ValueError(f"Content-addressed asset exists with wrong bytes: {target}")
    else:
        shutil.copyfile(source, target)
        if sha256(target) != actual_hash or target.read_bytes() != source.read_bytes():
            raise ValueError(f"Copied asset did not retain exact source bytes: {target}")
    width, height = png_dimensions(source)
    if png_dimensions(target) != (width, height):
        raise ValueError(f"Copied image dimensions differ: {target}")
    return "/" + relative_url.as_posix(), width, height


def record_artifact(record: dict[str, Any], role: str) -> dict[str, Any] | None:
    return next((artifact for artifact in record["artifacts"] if artifact["role"] == role), None)


def select_records(manifest: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    spatial = [record for record in manifest["records"] if record["identity"]["kind"] == "spatial"]
    by_source_family: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in spatial:
        source_id = record["identity"]["source"]["sample_id"]
        family = record["identity"]["operation"].get("family")
        by_source_family[(source_id, family)].append(record)

    source_ids = sorted({source_id for source_id, _ in by_source_family})
    complete: list[str] = []
    for source_id in source_ids:
        if not all((source_id, family) in by_source_family for family in REQUIRED_FAMILIES):
            continue
        candidate = [record for family in REQUIRED_FAMILIES for record in by_source_family[(source_id, family)]]
        if has_exact_grid(candidate):
            complete.append(source_id)
    if not complete:
        raise ValueError("No single source identity contains the full requested 18-case operation grid")

    selected_source = min(complete)
    selected = [
        record for record in spatial
        if record["identity"]["source"]["sample_id"] == selected_source
    ]
    if len(selected) != 18 or not has_exact_grid(selected):
        raise ValueError(f"Selected source identity does not have exactly 18 requested records: {selected_source}")
    selected.sort(key=case_sort_key)
    return selected_source, selected


def has_exact_grid(records: list[dict[str, Any]]) -> bool:
    if len(records) != 18:
        return False
    operations = [record["identity"]["operation"] for record in records]
    families = [operation.get("family") for operation in operations]
    if {family: families.count(family) for family in set(families)} != {
        "motion_blur": 2,
        "crop_truncation": 12,
        "latent_occlusion": 3,
        "combined_pupil": 1,
    }:
        return False
    crops = [operation for operation in operations if operation["family"] == "crop_truncation"]
    if {(op.get("edge"), op.get("target_visible_fraction")) for op in crops} != {
        (edge, fraction)
        for edge in EDGE_ORDER
        for fraction in VISIBLE_FRACTIONS
    }:
        return False
    occlusions = [operation for operation in operations if operation["family"] == "latent_occlusion"]
    if {operation.get("visible_fraction") for operation in occlusions} != set(VISIBLE_FRACTIONS):
        return False
    blurs = [operation for operation in operations if operation["family"] == "motion_blur"]
    blur_conditions = {(operation.get("kernel_length_px"), operation.get("angle_deg")) for operation in blurs}
    if len(blur_conditions) != 2:
        return False
    combined = [operation for operation in operations if operation["family"] == "combined_pupil"]
    return len(combined) == 1


def case_sort_key(record: dict[str, Any]) -> tuple[Any, ...]:
    operation = record["identity"]["operation"]
    family = operation["family"]
    rank = FAMILY_ORDER[family]
    if family == "motion_blur":
        return (rank, int(operation["kernel_length_px"]), float(operation["angle_deg"]))
    if family == "crop_truncation":
        return (rank, EDGE_ORDER[operation["edge"]], -float(operation["target_visible_fraction"]))
    if family == "latent_occlusion":
        return (rank, -float(operation["visible_fraction"]))
    return (rank, record["case_id"])


def severity_fields(operation: dict[str, Any]) -> tuple[str, float | None, str]:
    family = operation["family"]
    if family == "motion_blur":
        length = float(operation["kernel_length_px"])
        angle = float(operation["angle_deg"])
        return (f"{length:g} px motion-blur kernel at {angle:g}°", length, "kernel length (px)")
    if family == "crop_truncation":
        visible = float(operation["target_visible_fraction"])
        lost = 1.0 - visible
        return (f"{lost:.0%} truncated · {visible:.0%} target visible", lost, "pupil area removed (fraction)")
    if family == "latent_occlusion":
        visible = float(operation["visible_fraction"])
        occluded = 1.0 - visible
        return (f"{occluded:.0%} occluded · {visible:.0%} target visible", occluded, "pupil area occluded (fraction)")
    return ("combined pupil-local transform", None, "multiple parameters")


def label_for(operation: dict[str, Any], metadata: dict[str, Any]) -> str:
    family = operation["family"]
    if family == "motion_blur":
        return f"Motion blur · {operation['kernel_length_px']} px · {operation['angle_deg']:g}°"
    if family == "crop_truncation":
        visible = float(operation["target_visible_fraction"])
        achieved = float(metadata["achieved_visible_fraction"])
        return f"Crop truncation · {operation['edge']} edge · {visible:.0%} target visible ({achieved:.1%} achieved)"
    if family == "latent_occlusion":
        visible = float(operation["visible_fraction"])
        achieved = float(metadata["achieved_visible_fraction"])
        return f"Latent occlusion · {visible:.0%} target visible ({achieved:.1%} achieved)"
    return "Combined pupil-local transform · translate, scale, shear and rotate"


def coordinate_transform(metadata: dict[str, Any]) -> dict[str, Any] | None:
    forward = metadata.get("forward_affine_xy_homogeneous")
    inverse = metadata.get("inverse_affine_xy_homogeneous")
    if forward is None and inverse is None:
        return None
    return {
        "forwardAffineXYHomogeneous": forward,
        "inverseAffineXYHomogeneous": inverse,
        "operationSemantics": metadata.get("operation_semantics"),
    }


def build_manifest() -> dict[str, Any]:
    corpus_manifest_path = WORKSPACE / CORPUS_MANIFEST_REL
    execution_rows_path = WORKSPACE / EXECUTION_ROWS_REL
    corpus_manifest = json.loads(corpus_manifest_path.read_text(encoding="utf-8"))
    if corpus_manifest["corpus_version"] != "EXACT_GT_V2_1_CORRECTED":
        raise ValueError("Unexpected source corpus version")
    if corpus_manifest["counts"]["spatial_cases"] != 252:
        raise ValueError("Source corpus is not the frozen 252-row V2.1 corrected spatial corpus")

    source_id, selected = select_records(corpus_manifest)
    execution_rows = read_csv(execution_rows_path)
    execution_by_id: dict[str, dict[str, str]] = {}
    for row in execution_rows:
        if row.get("kind") != "spatial":
            continue
        execution_id = row["execution_id"]
        if execution_id in execution_by_id:
            raise ValueError(f"Duplicate frozen execution ID: {execution_id}")
        execution_by_id[execution_id] = row

    original_identity = selected[0]["identity"]["source"]
    original_hash = original_identity["source_image_sha256"]
    original_path = WORKSPACE / ORIGINAL_SOURCE_REL / source_id
    if not original_path.is_file():
        raise FileNotFoundError(f"Bounded original source frame not found: {original_path}")
    original_url, original_width, original_height = copy_hashed_png(
        original_path, "original-source", original_hash
    )
    if (original_width, original_height) != (155, 155):
        raise ValueError(f"Unexpected original source dimensions: {original_width}x{original_height}")

    cases: list[dict[str, Any]] = []
    expected_rows: set[str] = set()
    for record in selected:
        execution_id = record["case_id"]
        if execution_id in expected_rows:
            raise ValueError(f"Duplicate selected execution ID: {execution_id}")
        expected_rows.add(execution_id)
        row = execution_by_id.get(execution_id)
        if row is None:
            raise ValueError(f"Selected manifest record has no frozen execution row: {execution_id}")

        identity = record["identity"]
        operation = identity["operation"]
        metadata = record.get("metadata", {})
        artifacts = record["artifacts"]
        input_artifact = record_artifact(record, "input_image")
        if input_artifact is None:
            raise ValueError(f"Missing source PNG artifact: {execution_id}")
        if row["execution_id"] != execution_id or int(row["row_index"]) < 0:
            raise ValueError(f"Frozen execution ID/row index mismatch: {execution_id}")
        if row["source_sample_id"] != source_id or identity["source"]["sample_id"] != source_id:
            raise ValueError(f"Frozen source identity does not match selected identity: {execution_id}")
        if row["image_sha256"] != input_artifact["sha256"] or row["image_path"] != (
            str(CORPUS_REL / input_artifact["path"])
        ):
            raise ValueError(f"Execution row does not match frozen input artifact: {execution_id}")
        if row["operation_family"] != operation["family"]:
            raise ValueError(f"Execution row family does not match corpus manifest: {execution_id}")
        if json.loads(row["operation_json"]) != operation:
            raise ValueError(f"Execution row operation parameters do not match manifest: {execution_id}")
        if identity["source"]["source_image_sha256"] != original_hash:
            raise ValueError(f"Original source identity hash differs across selected cases: {execution_id}")

        source_path = WORKSPACE / row["image_path"]
        primary_path = WORKSPACE / row["primary_gt_path"]
        if not primary_path.is_file():
            raise FileNotFoundError(f"Missing frozen primary GT: {primary_path}")
        if sha256(source_path) != row["image_sha256"] or sha256(primary_path) != row["primary_gt_sha256"]:
            raise ValueError(f"Frozen source or primary GT hash mismatch: {execution_id}")
        primary_artifact = next((
            artifact for artifact in artifacts
            if artifact["path"] == str(primary_path.relative_to(WORKSPACE / CORPUS_REL))
            and artifact["sha256"] == row["primary_gt_sha256"]
        ), None)
        if primary_artifact is None:
            raise ValueError(f"Primary score GT is not an artifact in the frozen case record: {execution_id}")

        source_url, width, height = copy_hashed_png(source_path, "transformed-source", row["image_sha256"])
        gt_url, gt_width, gt_height = copy_hashed_png(primary_path, "primary-gt", row["primary_gt_sha256"])
        if (width, height) != (gt_width, gt_height):
            raise ValueError(f"Primary GT dimensions differ from transformed image: {execution_id}")

        latent_url = None
        latent_hash = None
        latent_width = None
        latent_height = None
        if row.get("latent_gt_path"):
            latent_path = WORKSPACE / row["latent_gt_path"]
            if not latent_path.is_file() or sha256(latent_path) != row["latent_gt_sha256"]:
                raise ValueError(f"Frozen latent GT hash mismatch: {execution_id}")
            latent_artifact = next((
                artifact for artifact in artifacts
                if artifact["path"] == str(latent_path.relative_to(WORKSPACE / CORPUS_REL))
                and artifact["sha256"] == row["latent_gt_sha256"]
            ), None)
            if latent_artifact is None:
                raise ValueError(f"Latent GT is not an artifact in the frozen case record: {execution_id}")
            latent_url, latent_width, latent_height = copy_hashed_png(
                latent_path, "latent-gt", row["latent_gt_sha256"]
            )
            if (latent_width, latent_height) != (width, height):
                raise ValueError(f"Latent GT dimensions differ from transformed image: {execution_id}")
            latent_hash = row["latent_gt_sha256"]

        pupil_artifact = (
            record_artifact(record, "visible_pupil_GT")
            or record_artifact(record, "resulting_GT_pupil_binary")
        )
        pupil_gt_url = None
        pupil_gt_hash = None
        if pupil_artifact:
            pupil_gt_path = WORKSPACE / CORPUS_REL / pupil_artifact["path"]
            if sha256(pupil_gt_path) != pupil_artifact["sha256"]:
                raise ValueError(f"Dedicated pupil GT hash mismatch: {execution_id}")
            pupil_gt_url, pupil_width, pupil_height = copy_hashed_png(
                pupil_gt_path, "pupil-gt", pupil_artifact["sha256"]
            )
            if (pupil_width, pupil_height) != (width, height):
                raise ValueError(f"Dedicated pupil GT dimensions differ from source: {execution_id}")
            pupil_gt_hash = pupil_artifact["sha256"]

        severity, severity_value, severity_unit = severity_fields(operation)
        primary_gt_format = row["primary_gt_format"]
        reference = {
            "src": source_url,
            "image": source_url,
            "gt": gt_url,
            "latentGt": latent_url,
            "visiblePupilGt": pupil_gt_url,
            "geometry": None,
            "coordinateSpace": "transformed image pixel grid",
            "primaryGtFormat": primary_gt_format,
        }
        case = {
            "id": execution_id,
            "executionId": execution_id,
            "rowIndex": int(row["row_index"]),
            "label": label_for(operation, metadata),
            "mode": "representative",
            "representative": True,
            "outcomeSelected": False,
            "category": "exact_gt",
            "kind": "spatial",
            "sourceId": source_id,
            "sourcePopulation": "EXACT_GT_V2_1_CORRECTED frozen synthetic spatial corpus; one authorized validation ROI identity",
            "perturbationType": operation["family"],
            "perturbation": operation["family"],
            "severity": severity,
            "severityValue": severity_value,
            "severityUnit": severity_unit,
            "parameters": operation,
            "frozenMetadata": metadata,
            "coordinateTransform": coordinate_transform(metadata),
            "originalSourceSrc": original_url,
            "originalSourceSha256": original_hash,
            "originalSourceDimensions": {"width": original_width, "height": original_height},
            "originalSourceGTMaskSha256": original_identity["source_GT_mask_sha256"],
            "sourceHash": row["image_sha256"],
            "sourceSplit": original_identity["source_split"],
            "operationJson": row["operation_json"],
            "frozenCorpus": {
                "version": corpus_manifest["corpus_version"],
                "manifestPath": str(CORPUS_MANIFEST_REL),
                "manifestSha256": sha256(corpus_manifest_path),
                "generatorSha256": corpus_manifest["implementation"]["generator_sha256"],
                "executionRowsPath": str(EXECUTION_ROWS_REL),
                "executionRowsSha256": sha256(execution_rows_path),
            },
            "selectionPolicy": "Lexicographically smallest source sample ID with the complete 18-operation grid, selected from frozen operation availability only; no prediction outputs or scores inspected.",
            "frames": [{
                "frameIndex": 0,
                "sourceFrameNumber": None,
                "timestampMs": None,
                "width": width,
                "height": height,
                "sourceSrc": source_url,
                "sourceId": source_id,
                "executionId": execution_id,
                "rowIndex": int(row["row_index"]),
                "reference": reference,
                "coordinateSpace": "transformed image pixel grid",
                "mediaHashes": {
                    "transformedSourceSha256": row["image_sha256"],
                    "originalSourceSha256": original_hash,
                    "exactGtSha256": row["primary_gt_sha256"],
                    "primaryGtSha256": row["primary_gt_sha256"],
                    "latentGtSha256": latent_hash,
                    "exactGtPupilMaskSha256": pupil_gt_hash,
                },
                "mediaPaths": {
                    "originalSourceSrc": original_url,
                    "transformedSourceSrc": source_url,
                    "primaryGtSrc": gt_url,
                    "latentGtSrc": latent_url,
                    "visiblePupilGtSrc": pupil_gt_url,
                },
            }],
        }
        cases.append(case)

    if len(cases) != 18:
        raise ValueError(f"Expected 18 cases, got {len(cases)}")
    if expected_rows != {case["id"] for case in cases}:
        raise ValueError("Selected execution IDs do not exactly equal exported case IDs")
    if {case["sourceId"] for case in cases} != {source_id}:
        raise ValueError("Exported cases do not share one fixed source identity")

    family_counts: dict[str, int] = defaultdict(int)
    for case in cases:
        family_counts[case["perturbationType"]] += 1
    if dict(family_counts) != {"motion_blur": 2, "crop_truncation": 12, "latent_occlusion": 3, "combined_pupil": 1}:
        raise ValueError(f"Unexpected requested family counts: {dict(family_counts)}")

    copied = [
        path for path in (WORKSPACE / "benchmark_site/public/media/exact-gt/severity-grid").rglob("*.png")
    ]
    return {
        "schema": "mouse-pupillometry-benchmark-exact-gt-v21-severity-grid.v1",
        "version": 1,
        "sourceCorpus": str(CORPUS_REL),
        "assetRoot": "/media/exact-gt/severity-grid/",
        "selection": {
            "sourceId": source_id,
            "sourceHash": original_hash,
            "sourceSplit": original_identity["source_split"],
            "policy": "Lexicographically smallest source sample ID with the complete requested grid; corpus manifest and operation availability only.",
            "caseCount": 18,
            "familyCounts": dict(family_counts),
        },
        "frozenInputs": {
            "manifestPath": str(CORPUS_MANIFEST_REL),
            "manifestSha256": sha256(corpus_manifest_path),
            "executionRowsPath": str(EXECUTION_ROWS_REL),
            "executionRowsSha256": sha256(execution_rows_path),
            "generatorSha256": corpus_manifest["implementation"]["generator_sha256"],
        },
        "unavailableRequestedExamples": [
            {"family": "noise", "status": "UNAVAILABLE", "reason": "No standalone noise operation exists in the frozen 252-row V2.1 spatial corpus."},
            {"family": "roi_shift", "status": "UNAVAILABLE", "reason": "No standalone ROI-shift operation exists in the frozen 252-row V2.1 spatial corpus."},
            {"family": "translation_sweep", "status": "UNAVAILABLE", "reason": "No standalone translation sweep exists; translation is only one component of the combined pupil-local transform."},
            {"family": "scale_sweep", "status": "UNAVAILABLE", "reason": "No standalone scale sweep exists; scale is only one component of the combined pupil-local transform."},
        ],
        "assetPolicy": "Byte-exact PNG copies of one original mouse-eye ROI, the 18 frozen transformed source images, primary scoring GT, and separate latent GT where present. No raw videos, Allen data, or other source identities are copied.",
        "cases": cases,
        "assetCount": len(copied),
        "assetBytes": sum(path.stat().st_size for path in copied),
    }


def main() -> None:
    output = WORKSPACE / OUTPUT_REL
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest()
    output.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "manifest": str(OUTPUT_REL),
        "sourceId": manifest["selection"]["sourceId"],
        "caseCount": len(manifest["cases"]),
        "familyCounts": manifest["selection"]["familyCounts"],
        "assets": manifest["assetCount"],
        "assetBytes": manifest["assetBytes"],
        "unavailableRequestedExamples": [item["family"] for item in manifest["unavailableRequestedExamples"]],
    }, indent=2))


if __name__ == "__main__":
    main()
