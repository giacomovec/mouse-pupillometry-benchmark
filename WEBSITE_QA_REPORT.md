# Mouse Pupillometry Benchmark Website QA

**Result: PASS for the private development preview, with pre-external qualifications.** No browser-visible functional blocker was found in the final exporter-stable build. This does not certify a formal benchmark freeze or external evaluation.

## Test target and export

- URL: `http://127.0.0.1:5173/`
- Date: 2026-09-24
- Export: `benchmark-data-dev-v1+40f1e28815b5f39c`
- Source fingerprint SHA-256: `40f1e28815b5f39ca025b4210b5d0653a28ff163751574c3485104b71bf74fcd`
- Manifest SHA-256: `b821c3104f08be550fd71cff9b7eb60805150195211143fe0b0d160155c21eb3`
- Counts shown by the site and checked against the final export: 146 metric cards, 58 visual cases (31 real-validation, 25 Exact-GT, 2 temporal), 47 method identities, and 30 deployment conditions.
- The page identifies the data as a development benchmark, says external evaluation has not been opened, and shows formal pre-external freeze **Pending** and export time **Not recorded**.
- Inspection was read-only. No application source or scientific data was changed for QA.

## Layout and browser health

- Checked 1440 × 900, 1024 × 768, and 390 × 844. At each size, document width matched the CSS client width: 1425, 1009, and 375 px respectively (the browser viewport reserves the scrollbar). The narrow layout had no page-level horizontal overflow; long header strips and comparison rows scroll within their own regions.
- Final console check returned no warnings or errors. At that point the page contained 88 image elements; 59 were loaded and none of the completed loads had `naturalWidth=0`. Remaining images were lazy/offscreen and were not all fetched in this final spot check.
- I visually inspected the live narrow viewport. The browser screenshot API returns image bytes but no file path, so no screenshot file was retained in `benchmark_site/qa/`.

## Metric cards, charts, and provenance

- The overview showed the final 146 / 58 / 47 counts. Evidence and provenance disclosures opened on inspected cards. Case, method, and sort controls were present and usable.
- Provenance shows the final export version and population/source information. The formal-freeze and export-time fields remain visibly unset as noted above.
- The versioned static page says it presents exported values rather than recalculating scores.

## Real-validation geometry and timing

- On representative case `af-01083608f999`, source frame 92, the reference image loaded. The center-error viewer rendered GT and method centers/vectors with numeric errors (for example, SegFormer B2 0.66 px and MEYE v0.1.1 0.24 px). Methods without exported center coordinates explicitly show N/A and no vector.
- The diameter viewer showed GT diameter 30.00 px and method values. Since the frozen rows do not provide ellipse orientation, the site uses an explicitly labeled horizontal area-equivalent diameter scale line; no orientation is inferred.
- Real-validation source frames have frame numbers but no justified timestamp because source FPS/timebase and `timestampMs` are absent. The viewer correctly says “time unavailable.” This is a source metadata limitation.
- The real atlas lacks retained native prediction-mask assets at the exact source hashes; runtime records contain hashes only. The UI must continue to show N/A for unavailable prediction masks rather than synthesizing masks from ellipses.

## Exact-GT and mask comparisons

- The Exact-GT diameter card listed all 25 cases, including the 18-case severity grid. Selecting **Motion blur · 9 px · 25°** loaded the paired original and transformed source tiles (155 × 155 px) and the matching hash-keyed pupil-only binary GT mask overlay. The original RGB source remained visible separately from the transformed-source tile.
- On the same severity case, the Exact-GT Dice card exposed six pixel-overlap comparisons. The visible legend identifies overlap, prediction-only / false positive, and GT-only / false negative. The first three comparison images loaded at 155 × 155 px; the others were horizontally offscreen/lazy at the time of inspection. The exporter audit reports 215 prediction masks and matching TP/FP/FN assets, so this QA spot check did not manually inspect all assets.
- GT mask and scored geometry are displayed without inferring an unavailable ellipse angle. Exported mask comparisons are case-specific.

## Temporal playback and traces

- TMS02 and TMS07 opened as 96-frame temporal cases with sourced 60 fps timing. Frame 0 displayed 0.000 s; stepping once advanced all 12 tiles and the trace cursor together to frame 1 at 0.017 s.
- TMS07 rendered available geometry/mask overlays and synchronized trajectory/residual traces. Unavailable outputs retain explicit N/A states.
- Temporal speed and frame controls were available. Static real-validation timestamps remain unavailable as noted above; the temporal timestamps are sourced and displayed.

## Risk curve, method colors, and deployment

- The real-validation risk card opened with 13 method tiles and a method selector containing the 8 methods with retained curves. The curve path changed when the method changed. At the first slider point the readout was 1/1337 retained, threshold 0.938363, 0.07% coverage, and 12.85% family-macro diameter ARE. One step later it showed 2/1337, threshold 0.937893, 0.15%, and 13.59%. SegFormer B2 selection changed the curve and showed the full-coverage endpoint: no confidence cutoff, 100%, 1337/1337 retained, and 15.45% ARE.
- The site explicitly qualifies the curve as a population-level view; alternate-threshold per-frame decisions were not exported. Evidence tiles show N/A for those decisions while retaining available confidence values.
- Family colors in the real-validation comparison were consistent: Standard DLC matched adapter `#7956A6`, DLC Model Zoo `#A48BCA`, Pupil-DLC `#BD417C`, MEYE v0.1.1 `#E59A5C`, and MEYE matched mask-only `#BB6532`. The U-Net shades were distinct in the checked chart: small `#16547e`, base `#1f78b4`, and B2-matched `#62a0ca`.
- Filtering deployment conditions to TensorRT + INT8 showed all three SegFormer B0/B1/B2 rows with red **FAIL COVERAGE** badges, coverage approximately 0.943 / 0.942 / 0.942, and n=1,130 for each. The filter controls preserve access to the full 30-condition table.

## Remaining qualifications

- Formal pre-external freeze is still Pending and export time is Not recorded; external evaluation remains unopened.
- Real-validation static frames have no justified timestamps, and the real atlas has no retained native prediction-mask assets at the exact source hashes.
- Risk data does not include frozen per-frame decisions for alternate thresholds.
- Runtime visual evidence remains labeled “evidence export pending.”
- These are data/provenance availability limits shown by the page, not browser rendering failures.

## Screenshot status

Live screenshots were inspected during the browser session, including the 390 × 844 layout. The available browser API returns in-memory image bytes without a filesystem path, so there are no screenshot files in `benchmark_site/qa/`.

## 2026-09-25 Pages-path production preview and deployment status

- GitHub API confirmed `giacomovec/mouse-pupillometry-benchmark` remains **private**, with repository admin access. Creating a workflow-based Pages site returned HTTP 422: `Your current plan does not support GitHub Pages for this repository.` GitHub Pages is not deployed; the expected URL cannot receive deployed browser QA under this account plan.
- The prepared production build uses Vite base `/mouse-pupillometry-benchmark/`. Its HTML assets and favicon resolve within that path. The standalone export verifier passed on both `public/data/` and `dist/data/`, including 820 referenced media hashes and zero broken local references. All 848 bounded PNGs are present in `dist/media/`.
- Public artifact audit found 14 JSON files, 848 PNGs, one favicon SVG, and `.nojekyll` under `public/`; no raw video, checkpoint, NPZ file, symlink, or file over 20 MB was present. The 848 PNGs have no textual metadata chunks. Exported JSON has no credential, person/subject identifier, private home path, or Allen/protected output row; its Allen/protected safety fields report zero or false. Provenance references some source NPZ paths and hashes, but no NPZ files are deployed. This audit concerns the current build and must be repeated if the export changes.
- Local production preview at `http://127.0.0.1:4173/mouse-pupillometry-benchmark/` loaded 146 metric cards and 146 visual-comparison toggles, with no data-load error, horizontal overflow, or console warning/error. At 390 × 844 px, document and client widths both measured 390 px. The first expanded real-validation grid showed 11 synchronized tiles and loaded source media from the project path.
- A direct `#metric-real-validation-center-mae-px` link loaded and scrolled its card into view after the data and nearby lazy charts rendered. The temporal grid showed 12 synchronized tiles; advancing one frame changed source media and the trace cursor from frame 0 / 0.000 s to frame 1 / 0.017 s, with zero broken completed images. The tested provenance disclosure opened and showed the version and source hashes.
- The deployment workflow runs all scientific and frontend checks on `main`. Official Pages artifact upload and deployment are paused until the account supports private-repository Pages and `PAGES_DEPLOY_ENABLED=true` is set. The pull-request verification workflow remains separate. Live Pages URL, HTTPS asset access, and deployed responsive browser QA remain **BLOCKED BY GITHUB PLAN**.
