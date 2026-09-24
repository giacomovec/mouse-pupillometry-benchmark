# Mouse Pupillometry Benchmark

Static development-benchmark explorer for collaborators. **External evaluation has not been opened.** The source repository is private; a GitHub Pages site from this personal repository would be public. The scientific tables in the parent MouseFormer project are authoritative; this repository contains versioned exports and bounded visual evidence for inspection. It does not run models or rescore results in the browser.

## Local use

Requires Node.js 22 and npm. From this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To build a static copy:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

With GitHub Desktop, clone the private `giacomovec/mouse-pupillometry-benchmark` repository while signed in to an account with access. Open the cloned folder in a terminal and run the same `npm ci` and `npm run dev` commands. GitHub Desktop can review and pull source updates.

The static output is `dist/`, built for `/mouse-pupillometry-benchmark/`. Pushes to `main` run lint, type checking, unit tests, packaged scientific-data and media-hash checks, and a production build. Official GitHub Pages Actions upload and deploy the artifact only when the repository variable `PAGES_DEPLOY_ENABLED` is `true`. GitHub's Pages API currently rejects setup for this private repository with `Your current plan does not support GitHub Pages for this repository`, so deployment remains paused and there is no live Pages URL. After the owner enables a plan that supports private-repository Pages, configure Pages to use GitHub Actions, set the variable to `true`, and push to `main` or rerun the workflow. The expected public URL is <https://giacomovec.github.io/mouse-pupillometry-benchmark/>. The separate pull-request workflow verifies proposed changes without deploying them.

## Refreshing benchmark exports

The parent research workspace contains the canonical score tables, checkpoint and protocol hashes, and media sources. Run the versioned exporter there, verify the generated manifest and referenced assets, then build the site. See [`export/README.md`](export/README.md) for the exact commands and source-to-export map. Do not edit numerical benchmark values in React source or hand-adjust exported JSON. Only bounded evidence frames belong in this repository; raw research videos and full datasets stay in the parent workspace.

## Reading the evidence

- Results are **development** results on frozen corrected real validation, synthetic Exact-GT, temporal, and A5000 runtime protocols. Allen scoring and protected inference queries remain zero.
- Mask metrics are unavailable for methods that produce geometry or keypoints only. A missing measure is shown as unavailable, never as zero or an ellipse-generated surrogate mask.
- The 31 real-validation visual cases contain 155 selected frames, GT masks, and scored geometry, but no retained prediction-mask arrays joined to those exact source hashes. Their mask overlays are marked unavailable; the aggregate mask scores still come from canonical tables.
- Low coverage and rejected frames remain visible. Conditional error values must be read with coverage.
- Common batch-one A5000 runtime is separate from native video/folder workflow time. Synchronized visual playback is for evidence comparison, not a latency measurement.
- The runtime tournament retained timing rows and output hashes, but no same-stream output images; runtime evidence grids are explicitly marked pending.
- Representative real cases are selected without model outcomes; worst-case mode is explicitly outcome-selected QC material.
- Methods retain the canonical family color across model, representation, operating point, backend, and precision variants.

Each card links its population, units, operating point, hashes, and score provenance to the export manifest. The parent project gate ledger controls any future change from development to frozen pre-external status.

## Sharing

The repository remains private. If Pages is enabled under a supported plan, its output will be public to anyone with its URL. The prepared build contains only the bounded mouse-eye evidence PNGs and versioned benchmark exports audited for public Pages publication; it contains no raw videos, full raw datasets, person identifiers, credentials, protected-test outputs, or Allen predictions. Do not add any of those to `public/` or to the deployed build. See [PRIVATE_HOSTING.md](PRIVATE_HOSTING.md) for the visibility boundary.
