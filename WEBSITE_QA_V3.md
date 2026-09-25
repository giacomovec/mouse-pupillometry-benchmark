# Website QA: SegFormer family versus published methods

**Date:** 2026-09-25
**Status:** Development benchmark; external evaluation unopened.

## Rendered routes and screenshots

| Route | Screenshot | Checked result |
|---|---|---|
| Overview | [overview-v3.png](qa/screenshots/overview-v3.png) | Three full-width vertical bar figures: diameter ARE, aligned coverage, common A5000 end-to-end latency. Native and prospective near-95% keypoint operating points remain distinct. |
| Published methods | [published-methods-v3.png](qa/screenshots/published-methods-v3.png) | Six vertical bar figures: diameter, coverage, retained-frame severe error, center, Dice where masks exist, and comparable latency. U-Net controls are off the primary graphs. |
| Robustness | [robustness-v3.png](qa/screenshots/robustness-v3.png) | Exact-reference operation/severity heatmap, source-defined response curve, and separate pooled summaries. Missing transforms are stated explicitly. |
| Temporal | [temporal-v3.png](qa/screenshots/temporal-v3.png) | Seed-specific RMSE/gain and phase/gain views; no temporal winner claimed. Architecture controls are optional. |
| SegFormer deployment | [deployment-v3.png](qa/screenshots/deployment-v3.png) | 27 corrected conditions and three earlier INT8 conditions are separated. Backend shape, precision fill, fixed family hue, and failed-coverage rings have a visible key. All 30 rows are accessible. |
| Methods & data | [methods-data-v3.png](qa/screenshots/methods-data-v3.png) | Matched U-Net control, paired family interval, condition table, definitions and export provenance. |
| Expanded evidence | [visual-comparison-v3.png](qa/screenshots/visual-comparison-v3.png) | Same source frame/crop for human reference, SegFormer B2 and MEYE, with per-method diameter overlay and controls. |

There are **12 directly visible primary vertical bar figures** across Overview (3), Published methods (6), and SegFormer deployment (3). The optional Overview accuracy × speed view adds one scatter plot. Four deployment trade-off plots are visible, with two further resource plots in a disclosure. The robustness and temporal pages use response curves, a severity heatmap, and two seed-specific trade-off views where bars would obscure the source-defined progression.

The evidence viewer indexes 58 bounded cases: 31 real-validation cases, 25 exact-reference cases and two temporal sequences. Major scalar figures have metric-specific visual-comparison links. No per-condition deployment image pairs are exported, so the deployment evidence dialog explicitly reports them unavailable rather than substituting a canonical SegFormer image. The dialog receives keyboard focus, contains Tab navigation, closes with Escape, and returns focus to its opener.

## Independent review and checks

The root controller inspected the rendered routes, the expanded comparison, and a 390 px mobile viewport in the in-app browser. At mobile width, the document did not overflow horizontally; the navigation scrolls inside its own strip. No console errors or warnings appeared during the route pass. An independent Luna worker reviewed the pre-final desktop screenshots and source/data bindings. Child-agent computer use was blocked by the tool's root-thread-only UI permission, so the interactive browser pass was performed by the controller; the Luna review was independent static and visual QA.

Local gates passed: `npm run lint`, `npm run build` (including typecheck), `npm test` (16 tests), Python exporter consistency tests (21 tests), canonical-source export verification, and built-export/media verification. Export verification reports 149 quantitative cards, 30 deployment conditions, 820 verified media hashes, zero broken local assets, and zero Allen/protected inferences. `git diff --check` and a public asset/source boundary scan also passed.

## Remaining scientific boundary

The 27 FP32/BF16/FP16 deployment rows share the corrected 1,337-frame validation and selected checkpoints. The three executed INT8 rows use an earlier 1,130-frame population and different checkpoint hashes. INT8 failed its own frozen 95% coverage gate in B0, B1 and B2; it has no valid paired FP32 output-fidelity values or aggregate ARE delta on the corrected cohort. B1/B2 corrected PyTorch FP32 deployment rows also fall one frame below 95%; the main real-validation coverage values are not substituted into deployment rows. External evaluation remains unopened.
