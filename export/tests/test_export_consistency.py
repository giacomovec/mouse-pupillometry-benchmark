"""Source-backed integrity checks for the static benchmark data export."""

from __future__ import annotations

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "build_benchmark_data.py"
SPEC = importlib.util.spec_from_file_location("benchmark_export", SCRIPT)
assert SPEC and SPEC.loader
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)

DATA = exporter.DEFAULT_OUT
SITE = exporter.SITE_ROOT
SOURCE_ROOT = exporter.ROOT
CANONICAL_AVAILABLE = (SOURCE_ROOT / exporter.IDENTITY_PATH).is_file()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class ExportStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = read_json(DATA / "benchmark_manifest.json")
        cls.visual = read_json(DATA / "visual_cases.json")

    def test_export_only_ci_verifier(self):
        result = exporter.verify_output(DATA, verify_canonical_inputs=False)
        self.assertGreaterEqual(result["quantitativeMetricCardCount"], 40)
        self.assertEqual(result["brokenLocalAssets"], 0)
        self.assertFalse(result["canonicalInputsChecked"])

    def test_export_is_development_and_not_formally_frozen(self):
        self.assertEqual(self.manifest["status"], "DEVELOPMENT")
        self.assertEqual(self.manifest["externalEvaluation"], "NOT_OPENED")
        self.assertIsNone(self.manifest["freeze"])
        self.assertEqual(self.manifest["freezeStatus"], "DEVELOPMENT_NOT_FORMALLY_FROZEN")
        self.assertTrue(self.manifest["version"].startswith("benchmark-data-dev-v1+"))

    def test_exact_gt_selected_grid_has_all_canonical_method_rows(self):
        cases = [case for case in self.visual["cases"] if case.get("category") == "exact_gt"]
        self.assertEqual(len(cases), self.manifest["exactGtVisualCaseCount"])
        expected_methods = {source["method_id"] for source in exporter.EXACT_GT_SOURCES} | set(exporter.EXACT_GT_EXTRA_VISUAL_METHOD_IDS)
        selected_mask_count = 0
        severity_mask_count = 0
        selected_comparison_count = 0
        severity_comparison_count = 0
        for case in cases:
            frame = case["frames"][0]
            self.assertEqual(set(frame["methods"]), expected_methods)
            self.assertTrue(all(not row.get("unavailable") for row in frame["methods"].values()))
            masks = sum(str(row.get("predictionMask") or "").startswith("/media/") for row in frame["methods"].values())
            comparisons = sum(bool((row.get("maskComparison") or {}).get("src")) for row in frame["methods"].values())
            self.assertEqual(masks, comparisons)
            is_severity_case = bool(frame.get("mediaHashes", {}).get("binaryPupilGtSha256"))
            if is_severity_case:
                severity_mask_count += masks
                severity_comparison_count += comparisons
                reference = frame["reference"]
                self.assertTrue(reference["gt"].startswith("/media/exact-gt/severity-grid/primary-gt/"))
                self.assertTrue(reference["mask"]["src"].startswith("/media/exact-gt/severity-grid/pupil-mask/"))
                self.assertEqual(reference["mask"]["kind"], "binary_pupil_ground_truth")
                self.assertTrue(reference["mask"]["sha256"])
                self.assertEqual(reference["gtSha256"], frame["mediaHashes"]["exactGtNativeSha256"])
            else:
                selected_mask_count += masks
                selected_comparison_count += comparisons
        self.assertEqual(len(cases), 25)
        self.assertEqual(sum(bool(case["frames"][0].get("mediaHashes", {}).get("binaryPupilGtSha256")) for case in cases), 18)
        self.assertEqual(selected_mask_count, 35)
        self.assertEqual(selected_comparison_count, 35)
        self.assertEqual(severity_mask_count, 180)
        self.assertEqual(severity_comparison_count, 180)
        exact_gt = read_json(DATA / "exact_gt.json")
        pupil_mask_cases = exact_gt["severityGrid"]["pupilMaskAssets"]["cases"]
        sample = next(row for row in pupil_mask_cases if row["rowIndex"] == 72)
        self.assertEqual(sample["pupilPixelCount"], 53)
        self.assertEqual(sample["canonicalTruthArea"], 53)
        sample_case = next(case for case in cases if case["id"] == sample["caseId"])
        self.assertEqual(sample_case["frames"][0]["reference"]["geometry"]["area"], 53)
        self.assertEqual(self.manifest["exactGtMethodCaseRecordCount"], len(cases) * len(expected_methods))
        self.assertEqual(self.manifest["exactGtMatchedMethodCaseRecordCount"], len(cases) * len(expected_methods))

    def test_exact_gt_metric_cards_link_all_frozen_cases(self):
        exact_gt = read_json(DATA / "exact_gt.json")
        exact_case_ids = {case["id"] for case in self.visual["cases"] if case.get("category") == "exact_gt"}
        self.assertEqual(len(exact_case_ids), 25)
        representative = next(card for card in exact_gt["cards"] if card["id"] == "exact-gt-diameter_are-mean")
        self.assertEqual(set(representative["visualCaseIds"]), exact_case_ids)
        self.assertTrue(all(case_id in {case["id"] for case in self.visual["cases"]} for case_id in representative["visualCaseIds"]))
        for card in exact_gt["cards"]:
            self.assertEqual(set(card["visualCaseIds"]), exact_case_ids)

    def test_frozen_website_visual_case_index_preserves_selection_and_source_hashes(self):
        index = read_json(DATA / "WEBSITE_VISUAL_CASES.json")
        self.assertEqual(index["schema"], "WEBSITE_VISUAL_CASES_V1")
        self.assertTrue(index["sourceManifest"]["sha256"])
        self.assertEqual(len(index["cases"]), 31)
        self.assertEqual(sum(case["representative"] and not case["outcomeSelected"] for case in index["cases"]), 21)
        self.assertEqual(sum(case["outcomeSelected"] for case in index["cases"]), 10)
        for case in index["cases"]:
            self.assertTrue(case["sourceHash"])
            self.assertTrue(case["selection"]["rule"])
            for frame in case["frames"]:
                self.assertTrue(frame["source"]["src"] and frame["source"]["sha256"])
                self.assertTrue(frame["groundTruth"]["src"] and frame["groundTruth"]["sha256"])

    def test_risk_coverage_card_preserves_source_curves_and_unavailable_methods(self):
        coverage = read_json(DATA / "coverage_risk.json")
        risk_cards = [card for card in coverage["cards"] if card.get("overlayType") == "risk"]
        self.assertEqual(len(risk_cards), 1)
        card = risk_cards[0]
        self.assertEqual(card["id"], "real-validation-risk-coverage")
        self.assertEqual(card["visualCaseIds"], [])
        curves = [method for method in card["methods"] if method.get("riskCoverage")]
        self.assertEqual(len(curves), self.manifest["riskCoveragePopulatedMethodCount"])
        for method in curves:
            no_cutoff = [point for point in method["riskCoverage"] if point.get("threshold") is None]
            self.assertEqual(len(no_cutoff), 1)
            self.assertEqual(no_cutoff[0]["thresholdLabel"], "No confidence cutoff")
            self.assertTrue(all(point["coverage"] is not None and point["risk"] is not None for point in method["riskCoverage"]))
        unavailable = [method for method in card["methods"] if not method.get("riskCoverage")]
        self.assertTrue(all(method.get("riskCoverageUnavailableReason") for method in unavailable))
        self.assertTrue(all(method.get("riskCoverageFrameDecisionUnavailableReason") for method in curves))

    def test_capabilities_are_categorical_and_preserve_unknown(self):
        capability_doc = read_json(DATA / "capabilities.json")
        self.assertEqual(len(capability_doc["matrix"]), self.manifest["capabilityDefinitionCount"])
        self.assertTrue(all(entry["methods"] for entry in capability_doc["matrix"]))
        statuses = [
            method["nativeSupport"]
            for entry in capability_doc["matrix"]
            for method in entry["methods"]
        ]
        self.assertIn("UNKNOWN", statuses)

    def test_deployment_keeps_all_conditions_and_int8_coverage_failures(self):
        deployment = read_json(DATA / "deployment.json")
        conditions = deployment["cards"][0]["methods"]
        self.assertEqual(len(conditions), self.manifest["deploymentConditionCount"])
        int8_failures = [
            row for row in conditions
            if "int8" in str(row.get("quantization") or "").lower() and row.get("status") == "FAIL COVERAGE"
        ]
        self.assertEqual(len(int8_failures), 3)
        self.assertEqual({row.get("backend") for row in conditions}, {"PyTorch", "Inductor", "TensorRT"})
        self.assertEqual({row.get("precision") for row in conditions}, {"FP32", "BF16", "FP16", "INT8"})
        self.assertTrue(all(row.get("backendRaw") and row.get("precisionRaw") for row in conditions))
        matrix_conditions = [row for row in conditions if row.get("precision") != "INT8"]
        self.assertTrue(all(row.get("deploymentMatrixBackendRaw") and row.get("deploymentMatrixPrecisionRaw") for row in matrix_conditions))
        self.assertTrue(all(card.get("visualEvidenceUnavailableReason") for card in deployment["cards"]))
        runtime = read_json(DATA / "runtime.json")
        self.assertTrue(all(card.get("visualEvidenceUnavailableReason") and not card.get("visualCaseIds") for card in runtime["cards"]))

    def test_method_registry_uses_canonical_unet_variant_shades(self):
        methods = read_json(DATA / "methods.json")
        variants = {row["methodId"]: row for row in methods["variants"]}
        self.assertEqual(variants["unet_small"]["color"], "#16547e")
        self.assertEqual(variants["unet_base"]["color"], "#1f78b4")
        self.assertEqual(variants["unet_b2_matched"]["color"], "#62a0ca")
        self.assertEqual(variants["unet_small"]["familyColor"], "#1F78B4")

    def test_temporal_three_hz_values_remain_per_seed_not_pooled(self):
        temporal = read_json(DATA / "temporal.json")
        for metric_id in ("temporal-sine3HzGain", "temporal-sine3HzPhaseLagSec"):
            card = next(card for card in temporal["cards"] if card["id"] == metric_id)
            for method in card["methods"]:
                self.assertIsNone(method["value"])
                self.assertEqual(method["status"], "PER_SEED_OBSERVATIONS_ONLY")
                self.assertTrue(all("seedId" in point and "value" in point for point in method["perSeed"]))

    def test_temporal_visuals_are_synchronized_and_keep_abstentions(self):
        cases = [case for case in self.visual["cases"] if case.get("category") == "temporal"]
        self.assertEqual(len(cases), 2)
        self.assertEqual({case["id"] for case in cases}, {
            "exact-gt-v22-tms02-diameter-sine", "exact-gt-v22-tms07-diameter-sine",
        })
        for case in cases:
            self.assertEqual(len(case["frames"]), 96)
            self.assertEqual([frame["frameIndex"] for frame in case["frames"]], list(range(96)))
            frame = case["frames"][0]
            self.assertEqual(set(frame["methods"]), set(exporter.TEMPORAL_VISUAL_METHOD_IDS))
            self.assertEqual(frame["reference"]["geometry"]["mask"]["src"], frame["reference"]["gt"])
            self.assertTrue(frame["sourceSrc"].startswith("/media/temporal/"))
        tms02 = next(case for case in cases if "tms02" in case["id"])
        for method_id in ("standard_dlc_matched", "pupil_dlc_gm"):
            method = tms02["frames"][0]["methods"][method_id]
            self.assertEqual(method["status"], "ABSTAINED")
            self.assertIs(method["accepted"], False)
        tms07 = next(case for case in cases if "tms07" in case["id"])
        self.assertTrue(tms07["frames"][0]["methods"]["standard_dlc_matched"]["accepted"])
        unet = tms02["frames"][0]["methods"]["unet_small"]
        self.assertEqual(unet["status"], "UNAVAILABLE")
        self.assertIsNone(unet["geometry"].get("diameter"))
        self.assertTrue(unet["geometry"].get("unavailableReason"))
        temporal = read_json(DATA / "temporal.json")
        case_ids = {case["id"] for case in cases}
        self.assertTrue(all(set(card["visualCaseIds"]) == case_ids for card in temporal["cards"]))


@unittest.skipUnless(CANONICAL_AVAILABLE, "Canonical project CSV/JSON inputs are not packaged with the standalone site repository.")
class CanonicalValueJoinTests(unittest.TestCase):
    def test_exact_gt_display_geometry_matches_hash_joined_source_row(self):
        visual = read_json(DATA / "visual_cases.json")
        case = next(case for case in visual["cases"] if case.get("category") == "exact_gt")
        frame = case["frames"][0]
        method_id = "dlc_zoo_mouse_pupil_vclose"
        path = SOURCE_ROOT / exporter.EXACT_GT_FRAME_METRIC_PATHS[method_id]
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            row = next(row for row in csv.DictReader(stream) if row.get("execution_id") == case["id"])
        exported = frame["methods"][method_id]
        self.assertEqual(exported["provenance"]["sourceImageSha256"], frame["mediaHashes"]["transformedSourceSha256"])
        self.assertEqual(exported["provenance"]["primaryGtSha256"], row["primary_gt_sha256"])
        self.assertAlmostEqual(exported["geometry"]["center"]["x"], float(row["predicted_center_x"]))
        self.assertAlmostEqual(exported["geometry"]["diameter"], float(row["predicted_equivalent_diameter"]))
        self.assertAlmostEqual(exported["values"]["diameter_are"], float(row["diameter_are"]))

    def test_temporal_three_hz_value_matches_raw_canonical_csv(self):
        temporal = read_json(DATA / "temporal.json")
        card = next(card for card in temporal["cards"] if card["id"] == "temporal-sine3HzGain")
        method = next(row for row in card["methods"] if row["methodId"] == "meye_matched")
        point = next(row for row in method["perSeed"] if row["seedId"] == "TMS02")
        source_path = SOURCE_ROOT / exporter.TEMPORAL_SEED_PATH
        with source_path.open("r", encoding="utf-8-sig", newline="") as stream:
            source = next(row for row in csv.DictReader(stream) if row.get("method_id") == "meye_matched" and row.get("seed_id") == "TMS02")
        self.assertAlmostEqual(point["value"], float(source["sine_3hz_gain"]))

    def test_full_verifier_checks_every_canonical_source_hash(self):
        result = exporter.verify_output(DATA, verify_canonical_inputs=True)
        provenance = read_json(DATA / "provenance.json")
        self.assertTrue(result["canonicalInputsChecked"])
        self.assertEqual(result["verifiedCanonicalInputCount"], len(provenance["inputs"]))

    def test_rebuild_from_identical_inputs_is_byte_identical(self):
        with tempfile.TemporaryDirectory(prefix="benchmark-export-repro-") as temporary:
            temp_out = Path(temporary) / "data"
            built = exporter.build(temp_out)
            current_manifest = read_json(DATA / "benchmark_manifest.json")
            self.assertEqual(built["version"], current_manifest["version"])
            for filename in current_manifest["files"]:
                self.assertEqual((temp_out / filename).read_bytes(), (DATA / filename).read_bytes(), filename)


if __name__ == "__main__":
    unittest.main()
