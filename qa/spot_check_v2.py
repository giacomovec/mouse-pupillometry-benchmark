"""Independent UI-export-canonical spot check for the public v2 figures."""
import csv
import hashlib
import json
import math
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
DATA = SITE / "public/data"


def payload(name):
    return json.loads((DATA / name).read_text())


def rows(path):
    with (ROOT / path).open(newline="", encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def same(actual, expected, context):
    assert math.isclose(float(actual), float(expected), rel_tol=1e-10, abs_tol=1e-9), (context, actual, expected)
    return f"{float(actual):.6f}"


def source_ref(ref):
    path = ROOT / ref["path"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == ref["sha256"], path
    return ref["path"]


report = [
    "# Website result integrity v2",
    "",
    "Independent values checked from the rendered figure/table input through its generated JSON and its hash-bound canonical input. These checks use the exact fields consumed by `src/App.tsx`; `python3 qa/spot_check_v2.py` regenerates this record and fails on disagreement.",
    "",
    "| UI figure/table input | Condition | Display value | Canonical source |",
    "|---|---|---:|---|",
]

conditions = payload("real_validation_v2.json")["conditions"]
summary_path = "parallel_handoffs/benchmark_expansion_20260919/real_validation_v7/REAL_VALIDATION_SUMMARY.csv"
summary = rows(summary_path)
for method in ["segformer_b0", "segformer_b1", "segformer_b2", "standard_dlc_matched", "pupil_dlc_gm", "meye_released"]:
    condition = next(c for c in conditions if c["methodId"] == method and c["plane"] == "shared_scalar_mask_gt")
    source = next(r for r in summary if r["method_id"] == method and r["plane"] == "shared_scalar_mask_gt")
    value = same(condition["metrics"]["diameterArePercent"], float(source["family_macro_diameter_are"]) * 100, method)
    same(condition["coveragePercent"], float(source["coverage"]) * 100, method + " coverage")
    source_ref(condition["sourceRefs"][0])
    report.append(f"| Published benchmark ARE + coverage | {method}, native | {value}% ARE; {condition['coveragePercent']:.2f}% coverage | `{summary_path}` |")

for method in ["standard_dlc_matched", "pupil_dlc_gm"]:
    condition = next(c for c in conditions if c["methodId"] == method and c["plane"] == "prospective_coverage_matched")
    ref = condition["sourceRefs"][0]
    source = json.loads((ROOT / source_ref(ref)).read_text())[method]["coverage_95"]
    value = same(condition["metrics"]["diameterArePercent"], source["family_macro_diameter_are"] * 100, method + " matched")
    same(condition["coveragePercent"], source["coverage"] * 100, method + " matched coverage")
    report.append(f"| Practical-coverage comparison | {method}, prospective 95% | {value}% ARE; {condition['coveragePercent']:.2f}% coverage | `{ref['path']}` |")

for method in ["unet_small", "unet_base", "unet_b2_matched"]:
    condition = next(c for c in conditions if c["methodId"] == method)
    ref = condition["sourceRefs"][0]
    source = next(r for r in rows(source_ref(ref)) if r["method_id"] == method)
    value = same(condition["metrics"]["diameterArePercent"], float(source["family_macro_diameter_are"]) * 100, method)
    same(condition["coveragePercent"], float(source["coverage"]) * 100, method + " coverage")
    report.append(f"| Methods architecture control | {method} | {value}% ARE; {condition['coveragePercent']:.2f}% coverage | `{ref['path']}` |")

severity = payload("exact_gt_severity_v2.json")
for method, family, level in [("segformer_b2", "motion_blur", "5"), ("segformer_b2", "latent_occlusion", "0.5"), ("unet_b2_matched", "crop_truncation", "0.5")]:
    cell = next(c for c in severity["rows"] if c["methodId"] == method and c["operationFamily"] == family and str(c["severity"]) == level)
    ref = cell["sourceRefs"][0]
    frame_rows = {r["execution_id"]: r for r in rows(source_ref(ref))}
    valid = [float(frame_rows[case_id]["diameter_are"]) for case_id in cell["caseIds"] if frame_rows[case_id]["valid"].lower() == "true" and frame_rows[case_id]["diameter_are"]]
    assert len(valid) == cell["accepted"] and len(cell["caseIds"]) == cell["attempted"]
    value = same(cell["value"], sum(valid) / len(valid) * 100, method + family + level)
    report.append(f"| Exact-GT severity cell | {method}, {family} {level} | {value}% ARE; {cell['accepted']}/{cell['attempted']} retained | `{ref['path']}` |")

observations = payload("temporal.json")["data"]["perSeedObservations"]
temporal_path = "parallel_handoffs/benchmark_expansion_20260919/temporal_v22_results/interim_ten_methods_meye_matched_20260923/PER_SEED.csv"
temporal_source = rows(temporal_path)
for method, seed, metric, canonical in [("segformer_b2", "TMS01", "diameterRmsePx", "diameter_rmse_px"), ("meye_matched", "TMS02", "sine3HzGain", "sine_3hz_gain"), ("mouse_pupil_analysis_v020", "TMS03", "sine3HzPhaseLagSec", "sine_3hz_phase_lag_sec")]:
    observation = next(o for o in observations if o["methodId"] == method and o["seedId"] == seed)
    source = next(r for r in temporal_source if r["method_id"] == observation["sourceMethodId"] and r["seed_id"] == seed)
    value = same(observation[metric], source[canonical], method + seed + metric)
    report.append(f"| Temporal seed-specific plot | {method}, {seed}, {metric} | {value} | `{temporal_path}` |")

runtime = next(c for c in payload("runtime.json")["cards"] if c["id"] == "runtime-common-end_to_end_p50_ms")
runtime_path = "parallel_handoffs/benchmark_expansion_20260919/closure_common_a5000_runtime/tournament_v1/TOURNAMENT.csv"
runtime_source = rows(runtime_path)
for method in ["segformer_b0", "segformer_b1", "segformer_b2"]:
    output = next(m for m in runtime["methods"] if m["methodId"] == method)
    source = next(r for r in runtime_source if r["model_id"] == method)
    value = same(output["value"], source["end_to_end_p50_ms"], method + " runtime")
    report.append(f"| Common A5000 latency plot | {method} | {value} ms p50 | `{runtime_path}` |")

deployment = next(c for c in payload("deployment.json")["cards"] if c["id"] == "deployment-end_to_end_latency_p50_ms")
deploy_path = "parallel_handoffs/acquisition_family_corrected_wave_20260915/results/deployment_summary/SEGFORMER_DEPLOYMENT_MATRIX.csv"
deploy_source = rows(deploy_path)
for model in ["B0", "B1", "B2"]:
    output = next(m for m in deployment["methods"] if m["methodId"] == f"segformer_{model.lower()}__pytorch_fp32")
    source = next(r for r in deploy_source if r["model"] == model and r["runtime"] == "pytorch_fp32")
    value = same(output["value"], source["end_to_end_latency_p50_ms"], model + " deployment")
    report.append(f"| Deployment frontier | {model} PyTorch FP32 | {value} ms p50 | `{deploy_path}` |")

native = payload("native_cpu_runtime_v2.json")
assert native["comparableToCommonA5000"] is False
native_path = "parallel_handoffs/benchmark_expansion_20260919/runtime_benchmark/population_v2/CONTROLLED_CPU_RUNTIME_POPULATION.csv"
native_source = rows(native_path)
for method in ["classical_fixed", "mouse_pupil_analysis_v020", "pypupilext_purest_v001"]:
    output = next(c for c in native["conditions"] if c["methodId"] == method)
    source = next(r for r in native_source if r["method_id"] == method)
    value = same(output["endToEndP50Ms"], source["end_to_end_p50_ms"], method + " native runtime")
    report.append(f"| Separate native CPU plot | {method} | {value} ms p50 | `{native_path}` |")

report += ["", "All 23 values matched. Percent conversions are explicit. Exact-GT cell means use only valid frame scores, retain the attempted denominator, and carry no inferred CI. Native CPU latency remains separate from the common A5000 frontier.", ""]
(SITE / "WEBSITE_RESULT_INTEGRITY_V2.md").write_text("\n".join(report))
print("23 canonical UI input checks passed")
