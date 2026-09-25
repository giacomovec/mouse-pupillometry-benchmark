# Website redesign v2 implementation

Historical implementation record. The current deployment cohort distinction and output-fidelity export are documented in [WEBSITE_RESULT_INTEGRITY_V3.md](WEBSITE_RESULT_INTEGRITY_V3.md).

## Scientific presentation

The public site now leads with a measured development result: SegFormer B2 diameter ARE and coverage, alongside Standard DLC's native conditional ARE and coverage. The five destinations are Overview, Published-method benchmark, Robustness & time, SegFormer deployment, and Methods & data. Matched U-Nets remain available as architecture controls under Methods & data and as an optional overlay, without turning the primary comparison into a Transformer-versus-U-Net story.

Accuracy is always labeled as conditional on accepted frames and read with attempted-frame coverage. Published/native methods with valid evidence remain in the primary roster even when they perform poorly. The paired seven-family U-Net interval is described as crossing zero, with no broad architecture winner asserted. External and Allen evaluation remain unopened, and the formal scientific freeze remains pending.

The figure system uses accuracy×coverage, accuracy×speed, severe-failure tradeoffs, Exact-GT source-severity heatmap and response curves, clean×robustness, seed-specific temporal RMSE×gain and lag×gain, deployment accuracy×latency and coverage×latency, runtime quantiles, paired architecture forest, and optional size/VRAM tradeoffs. Frontiers use measured points within a compatible protocol and recompute when their coverage filter changes. Native CPU timing is displayed as a separate eight-method Mac arm64, 14-sample batch-one protocol. The common A5000 frontier does not mix its values with native CPU timing.

## Data and interaction

`export/build_benchmark_data.py` derives compact overview and typed condition exports from hash-bound canonical sources. The overview requests `overview_v2.json`; other category data load when a route opens. The evidence dialog fetches its index and a single selected case file when opened, rather than the full 58-case bundle. The original full export remains available for download and technical inspection. The technical explorer mounts only on request.

The visual comparison shows source/GT and two synchronized method columns, with native/scored evidence where exported, metric-aware readouts, provenance, and explicit absence messages. It supports a 58-case index: 31 real-validation, 25 Exact-GT, and two temporal cases. Outcome-selected examples are marked QC. Hash routes and query state preserve the scientific view, seed, transform/severity, method comparison, selected case, and coverage selection.

The exporter verifies 145 canonical inputs, 76 output files, 820 media asset hashes, and zero broken references. It retains 146 quantitative cards and 90 categorical capability definitions behind the technical explorer. Exact-GT severity has 45 measured cells across five methods, with accepted/attempted counts and no invented confidence intervals. Thirty SegFormer deployment conditions remain visible, including all three executed INT8 failures of the ≥95% coverage gate.

## Scope and limitations

The frozen development population has seven acquisition families and 1,337 validation frames; biological mouse IDs are unavailable. Exact-GT V2.1 has 252 frozen spatial cases. Temporal V2.2 reports per-seed 3-Hz gain and lag; public multi-frequency curves and synchronized event traces are not present in this export. Native-workflow timings are not common A5000 comparisons. No new inference, threshold selection, Allen scoring, or protected confirmation was run for this redesign.

The numerical audit is in [WEBSITE_RESULT_INTEGRITY_V2.md](WEBSITE_RESULT_INTEGRITY_V2.md), and browser/build checks are in [WEBSITE_QA_V2.md](WEBSITE_QA_V2.md).
