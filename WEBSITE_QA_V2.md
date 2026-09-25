# Website QA v2

## Gates

| Check | Result |
|---|---|
| Export build and canonical verification | Pass: 145 input hashes, 76 output files, 820 media hashes, zero broken assets |
| Exporter tests | 20/20 pass |
| Frontend tests | 16/16 pass |
| Typecheck and ESLint | Pass |
| Production Vite build | Pass |
| Independent UI-to-canonical spot checks | 23/23 pass; see `WEBSITE_RESULT_INTEGRITY_V2.md` |
| Public-boundary scan | No credential/key patterns, Allen predictions, protected inference output, or raw full dataset found in packaged site; safety counters are zero |

The production build contains 931 files totaling 54,761,888 bytes, including the retained downloadable full evidence bundle and media. Initial overview requests are the 815-byte HTML, 66,933-byte CSS, 360,942-byte JavaScript, and 82,209-byte compact overview JSON: 510,899 bytes before transport compression. The overview JSON is within the requested 50–100 KB target. Other scientific category JSON and selected-case media load on demand. There are 17 default-visible primary figures across the five destinations, three supplementary figures, 146 technical quantitative cards, 90 capability definitions, and 58 indexed evidence cases.

## Browser review

An independent browser QA worker checked desktop, 820px tablet, and 390px mobile in the local Vite preview. The 390px page has no document horizontal overflow; evidence, temporal, and native CPU views remain within the viewport. The 820px navigation intentionally scrolls inside its own row. Overview coverage is fixed at 0–100%, plotted error and latency axes begin at zero, and target labels in the temporal tradeoff do not overlap. Negative phase lag remains valid data. The console showed no errors or warnings after route, case, and viewport interactions.

The QA worker opened a measured Exact-GT blur × severity cell and verified that the URL and evidence viewer selected a matching frozen case, with images and SegFormer B2/MEYE columns loaded. Synchronized frame navigation, comparison switching, representative versus outcome-selected QC case labels, deployment INT8 unavailable-evidence explanation, and route/deep-link behavior were checked. Primary scientific figure and evidence labels use at least 12px CSS; some nonessential technical helper metadata is smaller.

## P0 review disposition

| Review issue | Disposition |
|---|---|
| DLC's native conditional error could appear as an overall win | Resolved by the first-screen B2/DLC accuracy-plus-coverage statement and paired axes |
| Matched U-Nets absent | Preserved in Methods & data architecture controls and optional plot overlay, per the later scientific-story addendum |
| mouse-pupil-analysis absent | Present in the primary published roster and figure |
| Gain target semantics | Horizontal/vertical target for 3-Hz gain is 1, with lag target 0 ms |
| Opening lacks a supported result | Opening cites generated canonical B2 and DLC values |
| Essential labels too small | Primary figure and evidence labels are 12px or larger |

## Captures

Full-page local-preview captures are in `qa/screenshots/`: overview, published-method benchmark, Exact-GT, temporal, and SegFormer deployment. A pre-redesign live-site viewport capture is preserved there too. The baseline source commit is tagged `pre-redesign-independent-review-v1`; the original benchmark manifest is in `qa/pre_redesign_benchmark_manifest.json`.

## Remaining scientific closure

The site is a development benchmark. External/Allen evaluation is unopened. The latest independent scientific review records no formal pre-external freeze: G9 matched MouseFormer confirmation was running, G10 final spatial architecture was open, and G11 temporal policy was provisional. Website publication does not close these gates.
