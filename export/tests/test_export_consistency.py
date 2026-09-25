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
        self.assertTrue(self.manifest["version"].startswith("benchmark-data-dev-v2+"))

    def test_v2_overview_registry_are_compact_typed_and_roster_safe(self):
        overview = read_json(DATA / "overview_v2.json")
        registry = read_json(DATA / "real_validation_v2.json")
        self.assertLess((DATA / "overview_v2.json").stat().st_size, 100_000)
        self.assertEqual(overview["schema"], "mouse-pupillometry-overview.v2")
        self.assertEqual(overview["population"]["acquisitionFamilyCount"], 7)
        self.assertEqual(overview["population"]["validationFrameCount"], 1337)
        self.assertEqual(overview["population"]["exactGtCaseCount"], 252)
        self.assertEqual(overview["safety"]["allenModelScoring"], 0)
        self.assertEqual(overview["safety"]["legacyProtectedInferenceQueries"], 0)
        primary = {row["methodId"] for row in registry["conditions"] if row["primary"]}
        expected = exporter.PUBLISHED_PRIMARY_METHOD_IDS - {"pupil_dlc_im"}
        if any(row["methodId"] == "pupil_dlc_im" for row in registry["conditions"]):
            expected.add("pupil_dlc_im")
            self.assertTrue(all("session-adapted" in row["label"] for row in registry["conditions"] if row["methodId"] == "pupil_dlc_im"))
        self.assertEqual(primary, expected)
        self.assertNotIn("meye_matched", {point.get("methodId") for point in overview["figures"]["accuracyCoverage"]})
        self.assertTrue(all("unet" not in str(point.get("id", "")) for point in overview["figures"]["accuracyCoverage"]))
        self.assertTrue(all("unet" not in str(point.get("id", "")) for point in overview["figures"]["practicalCoverage"]))
        for point in overview["figures"]["accuracyCoverage"]:
            self.assertTrue(point.get("methodId"))
            self.assertTrue(point.get("sourceRefs"))
            self.assertEqual(point["accuracyPercent"], point.get("accuracyPercent"))
        standard_dlc = [point for point in overview["figures"]["accuracyCoverage"] if point.get("methodId") == "standard_dlc_matched"]
        self.assertEqual(len(standard_dlc), 2)
        self.assertEqual(standard_dlc[0]["connectionId"], standard_dlc[1]["connectionId"])
        self.assertEqual(len(overview["figures"]["commonSpeedAccuracy"]), 9)
        self.assertTrue(all(point["comparable"] and point["runtimeProtocol"] and point["sourceRefs"] for point in overview["figures"]["commonSpeedAccuracy"]))
        self.assertEqual(len(overview["figures"]["pairedArchitecture"]), 3)
        source_hashes = {entry["path"]: entry["sha256"] for entry in read_json(DATA / "provenance.json")["inputs"]}
        for condition in registry["conditions"]:
            self.assertIsInstance(condition["primary"], bool)
            self.assertIsNotNone(condition.get("coveragePercent"))
            for ref in condition["sourceRefs"]:
                self.assertEqual(ref["sha256"], source_hashes[ref["path"]])
                self.assertTrue(ref["type"])
                self.assertTrue(ref.get("rowId") is None or isinstance(ref["rowId"], str))

    def test_split_case_index_and_per_case_payloads_equal_full_bundle(self):
        index = read_json(DATA / "visual_case_index_v2.json")
        self.assertEqual(len(index["cases"]), len(self.visual["cases"]))
        full = {case["id"]: case for case in self.visual["cases"]}
        self.assertEqual(set(full), {row["id"] for row in index["cases"]})
        for row in index["cases"]:
            payload_path = DATA / row["file"]
            payload = read_json(payload_path)
            self.assertEqual(payload["case"], full[row["id"]])
            manifest_file = self.manifest["files"][row["file"]]
            self.assertEqual(exporter.sha256_file(payload_path), manifest_file["sha256"])
            self.assertEqual(row["category"], full[row["id"]]["category"])

    def test_quantitative_exact_gt_severity_is_joined_to_frozen_rows(self):
        severity = read_json(DATA / "exact_gt_severity_v2.json")
        self.assertEqual(severity["schema"], "mouse-pupillometry-exact-gt-severity.v2")
        self.assertEqual(severity["caseCount"], 252)
        self.assertEqual(len(severity["rows"]), len(severity["methodIds"]) * 9)
        for method_id in severity["methodIds"]:
            cells = [row for row in severity["rows"] if row["methodId"] == method_id]
            self.assertEqual(len(cells), 9)
            self.assertEqual(sum(row["attempted"] for row in cells), 252)
            for cell in cells:
                self.assertLessEqual(cell["accepted"], cell["attempted"])
                self.assertEqual(len(cell["caseIds"]), cell["attempted"])
                self.assertEqual(cell["metricId"], "diameter_are")
                self.assertEqual(cell["value"], cell["valuePercent"])
                self.assertNotIn("lower", cell)
                self.assertNotIn("upper", cell)
                self.assertTrue(all(ref["path"] and ref["sha256"] and ref["type"] for ref in cell["sourceRefs"]))
        b2_blur5 = next(row for row in severity["rows"] if row["methodId"] == "segformer_b2" and row["operationFamily"] == "motion_blur" and row["severityValue"] == 5)
        self.assertGreater(b2_blur5["valuePercent"], 0)

    @unittest.skipUnless(CANONICAL_AVAILABLE, "Canonical Exact-GT frame tables are not packaged with the standalone site repository.")
    def test_quantitative_exact_gt_severity_matches_private_frame_tables(self):
        severity = read_json(DATA / "exact_gt_severity_v2.json")
        for method_id in severity["methodIds"]:
            cells = [row for row in severity["rows"] if row["methodId"] == method_id]
            source_path = SOURCE_ROOT / exporter.EXACT_GT_FRAME_METRIC_PATHS[method_id]
            with source_path.open("r", encoding="utf-8-sig", newline="") as stream:
                source_rows = list(csv.DictReader(stream))
            source_valid = sum(
                row.get("kind") in (None, "", "spatial")
                and exporter.as_bool(row.get("valid")) is True
                and row.get("diameter_are") not in (None, "")
                for row in source_rows
            )
            self.assertEqual(sum(row["accepted"] for row in cells), source_valid)
        b2_blur5 = next(row for row in severity["rows"] if row["methodId"] == "segformer_b2" and row["operationFamily"] == "motion_blur" and row["severityValue"] == 5)
        case_rows_path = SOURCE_ROOT / exporter.EXACT_GT_FRAME_METRIC_PATHS["segformer_b2"]
        execution_path = SOURCE_ROOT / f"{exporter.EXP}/exact_gt_execution_v2_1/EXACT_GT_V2_1_EXECUTION_ROWS.csv"
        with execution_path.open("r", encoding="utf-8-sig", newline="") as stream:
            execution = [row for row in csv.DictReader(stream) if row.get("kind") == "spatial" and row.get("operation_family") == "motion_blur" and json.loads(row["operation_json"]).get("kernel_length_px") == 5]
        with case_rows_path.open("r", encoding="utf-8-sig", newline="") as stream:
            by_id = {row.get("execution_id"): row for row in csv.DictReader(stream)}
        values = [float(by_id[row["execution_id"]]["diameter_are"]) for row in execution if by_id[row["execution_id"]].get("valid", "").lower() == "true"]
        self.assertEqual(b2_blur5["attempted"], len(execution))
        self.assertEqual(b2_blur5["accepted"], len(values))
        self.assertAlmostEqual(b2_blur5["valuePercent"], sum(values) / len(values) * 100)

    def test_native_cpu_timing_stays_protocol_separate_from_a5000(self):
        native = read_json(DATA / "native_cpu_runtime_v2.json")
        self.assertEqual(native["schema"], "mouse-pupillometry-native-cpu-runtime.v2")
        self.assertFalse(native["comparableToCommonA5000"])
        self.assertEqual(len(native["conditions"]), 8)
        self.assertEqual(native["hardware"]["machine"], "arm64")
        self.assertEqual(native["sharedStreamSamples"], 14)
        self.assertEqual({row["batchSize"] for row in native["conditions"]}, {1})
        self.assertEqual({row["sharedStreamIdentitySha256"] for row in native["conditions"]}, {native["sharedStreamIdentitySha256"]})
        self.assertTrue(all(row["latencyMs"] > 0 and row["endToEndP95Ms"] >= row["latencyMs"] for row in native["conditions"]))
        unavailable = {row["methodId"] for row in native["excludedMethods"]}
        self.assertTrue({"facemap_raw", "facemap_processed", "eyeloop"}.issubset(unavailable))
        provenance_hashes = {row["path"]: row["sha256"] for row in read_json(DATA / "provenance.json")["inputs"]}
        for row in native["conditions"]:
            for ref in row["sourceRefs"]:
                self.assertEqual(ref["sha256"], provenance_hashes[ref["path"]])

    def test_target_direction_cards_include_numeric_target(self):
        for path in DATA.glob("*.json"):
            if path.name == "benchmark_manifest.json":
                continue
            document = read_json(path)
            for card in document.get("cards", []):
                if card.get("direction") == "target":
                    expected = 1 if "gain" in card["id"].lower() else 0
                    self.assertEqual(card.get("targetValue"), expected)

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
        self.assertEqual({row.get("comparisonCohort") for row in matrix_conditions}, {"corrected-1337"})
        self.assertEqual({row.get("n") for row in matrix_conditions}, {1337})
        self.assertEqual({row.get("comparisonCohort") for row in int8_failures}, {"legacy-int8-1130"})
        self.assertEqual({row.get("n") for row in int8_failures}, {1130})
        for metric_id in (
            "deployment-diameter_delta_abs_px_median_vs_fp32",
            "deployment-changed_retention_count_vs_fp32",
            "deployment-pupil_mask_disagreement_percent_median_vs_fp32",
        ):
            fidelity = next(card for card in deployment["cards"] if card["id"] == metric_id)
            self.assertEqual(len(fidelity["methods"]), 30)
            self.assertEqual(sum(row["value"] is not None for row in fidelity["methods"]), 27)
            self.assertTrue(all(row["value"] is None for row in fidelity["methods"] if row["precision"] == "INT8"))
            self.assertTrue(all(row["provenance"]["sourceFile"] == exporter.DEPLOY_PARITY for row in fidelity["methods"]))
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
