import { useEffect, useMemo, useState } from 'react'
import EvidenceViewer from './EvidenceViewer'
import MetricCardView from './MetricCardView'
import CapabilityMatrix from './CapabilityMatrix'
import {
  AccuracyCoverageScatter,
  DeploymentFrontierScatter,
  DeploymentMatrix,
  DotIntervalPlot,
  PairedDifferenceForest,
  RiskCoveragePlot,
  RuntimeIntervalPlot,
  TradeoffScatter,
  TemporalRmseGainScatter,
  TransformSeverityHeatmap,
  TransformResponseCurve,
} from './ScientificFigures'
import type { AccuracyCoverageDatum, DeploymentFrontierDatum, DeploymentMatrixRow, DotIntervalDatum, PairedDifferenceDatum, RiskCoverageSeries, RuntimeIntervalDatum, TemporalRmseGainDatum, TradeoffDatum, TransformSeverityCell, TransformResponseSeries } from './ScientificFigures'
import { loadBenchmarkData } from './data'
import { getCards, getCase, getJson, setSharedState } from './v2Data'
import type { CaseIndexEntry, ExactSeverityExport, NativeCpuRuntimeExport, OverviewExport, RouteId, ValidationCondition, ValidationExport } from './v2Data'
import type { BenchmarkData, MetricCard, MethodRecord, VisualCase } from './types'

const NAV: Array<{ id: RouteId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'published-method-benchmark', label: 'Published-method benchmark' },
  { id: 'robustness-time', label: 'Robustness & time' },
  { id: 'segformer-deployment', label: 'SegFormer deployment' },
  { id: 'methods-data', label: 'Methods & data' },
]
const N = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const S = (value: unknown): string => typeof value === 'string' ? value : ''
const fmt = (value: unknown, digits = 2): string => N(value) === undefined ? 'N/A' : (value as number).toLocaleString(undefined, { maximumFractionDigits: digits })
const percent = (value: unknown): number | undefined => { const n = N(value); return n === undefined ? undefined : n <= 1 ? n * 100 : n }
const positiveCeiling = (values: Array<number | null | undefined>, step = 5) => Math.max(step, Math.ceil(Math.max(0, ...values.filter((value): value is number => N(value) !== undefined)) * 1.1 / step) * step)
const hashRoute = (): RouteId => {
  const id = decodeURIComponent(window.location.hash.slice(1)).split('/')[0]
  return NAV.some((item) => item.id === id) ? id as RouteId : 'overview'
}
const card = (cards: MetricCard[], id: string) => cards.find((item) => item.id === id)
const methodLabel = (method: MethodRecord) => method.methodName ?? method.label ?? method.name ?? method.methodId
const valueMethods = (item?: MetricCard) => (item?.methods ?? []).filter((method) => N(method.value) !== undefined && !method.unavailable)

function Figure({ number, title, note, children }: { number: string; title: string; note?: string; children: React.ReactNode }) {
  return <section className="paper-figure"><div className="figure-heading"><span>FIGURE {number}</span><h3>{title}</h3></div>{children}{note && <p className="figure-note">{note}</p>}</section>
}
function Section({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: string; children: React.ReactNode }) {
  return <section className="paper-section">{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{lead && <p className="section-lead">{lead}</p>}{children}</section>
}
function Loading({ label }: { label: string }) { return <div className="loading-state" role="status">Loading {label}…</div> }
function ErrorState({ error }: { error: unknown }) { return <div className="data-error" role="alert">Could not load this export: {error instanceof Error ? error.message : String(error)}</div> }
function getFigurePoints(data: OverviewExport): AccuracyCoverageDatum[] {
  return (data.figures?.accuracyCoverage ?? []).map((raw) => ({
    id: S(raw.id ?? raw.conditionId), label: S(raw.label ?? raw.methodName ?? raw.conditionId),
    coveragePercent: N(raw.coveragePercent ?? raw.xCoveragePercent) ?? NaN,
    accuracyPercent: N(raw.accuracyPercent ?? raw.yArePercent) ?? NaN,
    color: S(raw.color) || undefined, family: S(raw.family) || undefined,
    model: S(raw.model) || undefined, representation: S(raw.representation) || undefined,
    operatingPoint: S(raw.operatingPoint) || undefined, connectionId: S(raw.connectionId ?? raw.groupId) || undefined,
    accuracyLowerPercent: N(raw.accuracyLowerPercent ?? raw.ciLow),
    accuracyUpperPercent: N(raw.accuracyUpperPercent ?? raw.ciHigh),
    accepted: N(raw.accepted), attempted: N(raw.attempted),
    metadata: { methodId: S(raw.methodId), model: S(raw.model), representation: S(raw.representation),
      backend: S(raw.backend), precision: S(raw.precision), sourcePlane: S(raw.sourcePlane ?? raw.plane),
      families: N(raw.familyCount) ?? null,
      source: S(raw.sourcePath) || S((raw.sourceRefs as Array<Record<string, unknown>> | undefined)?.[0]?.path),
      sourceHash: S((raw.sourceRefs as Array<Record<string, unknown>> | undefined)?.[0]?.sha256) },
  })).filter((point) => Number.isFinite(point.coveragePercent) && Number.isFinite(point.accuracyPercent))
}
function getPaired(data: OverviewExport): PairedDifferenceDatum[] {
  return (data.figures?.pairedArchitecture ?? []).map((raw) => ({
    id: S(raw.id ?? raw.conditionId), label: S(raw.label),
    difference: N(raw.difference ?? raw.differencePercentagePoints) ?? NaN,
    lower: N(raw.lower ?? raw.ciLow) ?? NaN, upper: N(raw.upper ?? raw.ciHigh) ?? NaN,
    detail: S(raw.detail) || undefined,
  })).filter((row) => [row.difference, row.lower, row.upper].every(Number.isFinite))
}
function practicalRows(data: OverviewExport): DotIntervalDatum[] {
  return (data.figures?.practicalCoverage ?? []).map((raw) => ({
    id: S(raw.id ?? raw.conditionId), label: S(raw.label),
    value: N(raw.value ?? raw.accuracyPercent) ?? null,
    lower: N(raw.lower ?? raw.ciLow) ?? null,
    upper: N(raw.upper ?? raw.ciHigh) ?? null,
    color: S(raw.color) || undefined,
    detail: `${fmt(raw.coveragePercent)}% attempted-frame coverage${raw.reachesTarget === false ? '; does not reach target coverage' : ''}`,
  }))
}
function speedAccuracyRows(data: OverviewExport): TradeoffDatum[] {
  return (data.figures?.commonSpeedAccuracy ?? []).map((raw) => ({
    id: S(raw.id ?? raw.conditionId ?? raw.methodId), label: S(raw.label ?? raw.methodName),
    x: N(raw.latencyMs ?? raw.endToEndP50Ms) ?? null,
    y: N(raw.accuracyPercent ?? raw.diameterArePercent) ?? null,
    coveragePercent: N(raw.coveragePercent) ?? null,
    color: S(raw.color) || undefined,
    comparable: raw.comparable !== false,
    comparisonGroup: S(raw.runtimeProtocol) || 'common-a5000-batch-one',
    metadata: {
      methodId: S(raw.methodId),
      family: S(raw.family), model: S(raw.model), representation: S(raw.representation),
      operatingPoint: S(raw.operatingPoint), coveragePercent: N(raw.coveragePercent) ?? null,
      diameterArePercent: N(raw.accuracyPercent ?? raw.diameterArePercent) ?? null,
      endToEndP50Ms: N(raw.latencyMs ?? raw.endToEndP50Ms) ?? null,
      accepted: N(raw.accepted) ?? null, attempted: N(raw.attempted) ?? null,
      runtimeProtocol: S(raw.runtimeProtocol),
    },
  }))
}
function finding(points: AccuracyCoverageDatum[]) {
  const b2 = points.find((p) => p.id.includes('segformer_b2'))
  const dlc = points.find((p) => p.id.includes('standard_dlc_matched__shared_scalar_mask_gt'))
  if (!b2 || !dlc) return 'SegFormer B0, B1 and B2 are compared with established mouse-pupillometry techniques. Accuracy depends on accepted-frame coverage.'
  return `SegFormer B2 retains ${fmt(b2.coveragePercent)}% of attempted frames with ${fmt(b2.accuracyPercent)}% family-macro diameter error. Standard DLC's native operating point has ${fmt(dlc.accuracyPercent)}% conditional error at ${fmt(dlc.coveragePercent)}% coverage. Read accuracy and coverage together.`
}
function Overview({ data, onEvidence, go }: { data: OverviewExport; onEvidence: (methodId?: string) => void; go: (id: RouteId) => void }) {
  const points = getFigurePoints(data)
  const [showArchitectureControls, setShowArchitectureControls] = useState(false)
  const speed = speedAccuracyRows(data).filter((row) => showArchitectureControls || !/u.?net/i.test(row.label))
  const speedYDomain: [number, number] = [0, positiveCeiling(speed.map((row) => row.y))]
  const [minimumCoverage, setMinimumCoverage] = useState(() => Number(new URLSearchParams(window.location.search).get('minCoverage')) || 95)
  return <div className="route-page overview-page">
    <div className="opening"><div className="eyebrow">DEVELOPMENT BENCHMARK</div><h1>Mouse Pupillometry Benchmark</h1><p className="opening-finding">{finding(points)}</p><div className="opening-actions"><button className="text-action" onClick={() => onEvidence()}>Show same-frame visual comparison ↓</button><button className="text-action" onClick={() => go('published-method-benchmark')}>Inspect published methods →</button></div></div>
    <div className="overview-figures"><Figure number="A" title="SegFormer versus established methods" note="Family-macro diameter ARE versus accepted-frame coverage. Each error is conditional on accepted frames. Native and coverage-matched keypoint points are connected. Family bootstrap intervals omit training-seed variation."><AccuracyCoverageScatter points={points} onPointClick={(point) => onEvidence(S(point.metadata?.methodId) || point.id)} /></Figure><Figure number="B" title="Accuracy × end-to-end speed" note="Common A5000 batch-one protocol only. Methods requiring incompatible native workflows remain in the method table; observed Pareto frontier is within this protocol."><div className="coverage-filter"><label htmlFor="overview-min-coverage">Minimum coverage</label><select id="overview-min-coverage" value={minimumCoverage} onChange={(event) => { setMinimumCoverage(Number(event.target.value)); setSharedState({ minCoverage: event.target.value }) }}>{[50, 80, 90, 95, 99].map((value) => <option key={value} value={value}>{value}%</option>)}</select><label className="check-option"><input type="checkbox" checked={showArchitectureControls} onChange={(event) => setShowArchitectureControls(event.target.checked)} /> Show architecture controls</label></div><TradeoffScatter points={speed} xLabel="End-to-end p50 (ms)" yLabel="Family-macro diameter ARE (%)" xDirection="lower" yDirection="lower" coverageThresholdPercent={minimumCoverage} xDomain={[0, positiveCeiling(speed.map((row) => row.x))]} yDomain={speedYDomain} showFrontier onPointClick={(point) => onEvidence(S(point.metadata?.methodId) || point.id)} /></Figure></div>
    <div className="reading-strip"><span>Development only</span><span>Biological mouse IDs unavailable in the legacy set</span><span>External and Allen evaluation unopened</span><span>Final model selection pending</span><span>B2-matched U-Net control interval crosses zero</span></div>
    <div className="next-questions"><button onClick={() => go('robustness-time')}><b>Robustness & time</b><span>Exact-GT transforms and temporal fidelity →</span></button><button onClick={() => go('segformer-deployment')}><b>SegFormer deployment</b><span>Verified common timing and backend tradeoffs →</span></button><button onClick={() => go('methods-data')}><b>Methods & data</b><span>Estimands, source rows, exports →</span></button></div>
  </div>
}
function ValidationTable({ conditions }: { conditions: ValidationCondition[] }) {
  return <div className="table-scroll"><table className="science-table"><thead><tr><th>Method / condition</th><th>Diameter ARE</th><th>Family CI</th><th>Coverage</th><th>Retained / attempted</th><th>&gt;20% error</th><th>Families</th><th>Common A5000 p50</th></tr></thead><tbody>{conditions.map((row) => {
    const metrics = row.metrics ?? {}
    const diameter = N(metrics.diameterArePercent ?? metrics.familyMacroDiameterArePercent ?? row.diameterArePercent ?? row.familyMacroDiameterArePercent)
    const coverage = percent(row.coverage ?? row.coveragePercent)
    const ci = (metrics.diameterFamilyCi ?? row.familyCi) as { lower?: number; upper?: number } | undefined
    return <tr key={row.conditionId}><th><b>{S(row.label) || [row.family, row.model].filter(Boolean).join(' ')}</b><small>{[row.representation, row.operatingPoint, row.backend, row.precision].filter(Boolean).join(' · ')}</small></th><td>{diameter === undefined ? 'N/A' : `${fmt(diameter)}%`}</td><td>{ci && N(ci.lower) !== undefined && N(ci.upper) !== undefined ? `${fmt(ci.lower)}–${fmt(ci.upper)}` : 'N/A'}</td><td>{coverage === undefined ? 'N/A' : `${fmt(coverage)}%`}</td><td>{N(row.accepted) === undefined ? 'N/A' : `${fmt(row.accepted, 0)} / ${fmt(row.attempted, 0)}`}</td><td>{fmt(metrics.gt20Count ?? row.gt20Count, 0)}</td><td>{fmt(row.familyCount, 0)}</td><td>{N((row.commonRuntime as Record<string, unknown> | undefined)?.latencyMs) === undefined ? 'N/A' : `${fmt((row.commonRuntime as Record<string, unknown>).latencyMs)} ms`}</td></tr>
  })}</tbody></table></div>
}
function RealValidation({ summary, conditions, risk, onEvidence }: { summary: OverviewExport; conditions: ValidationCondition[]; risk: MetricCard[]; onEvidence: (methodId?: string) => void }) {
  const [showControls, setShowControls] = useState(false)
  const points = getFigurePoints(summary)
  const visibleConditions = showControls ? conditions : conditions.filter((row) => row.primary !== false && !/u.?net/i.test(S(row.family)))
  const practical = practicalRows(summary)
  const selectedRisk = card(risk, 'real-validation-risk-coverage')
  const curves: RiskCoverageSeries[] = (selectedRisk?.methods ?? []).filter((m) => (m.riskCoverage ?? []).length > 3 && /segformer|meye|pupil_dlc/i.test(m.methodId)).slice(0, 5).map((m) => ({ id: m.methodId, label: methodLabel(m), color: m.color, points: (m.riskCoverage ?? []).map((p) => ({ coveragePercent: percent(p.coverage) ?? NaN, riskPercent: percent(p.risk) ?? NaN, retained: p.retained, attempted: p.attempted })).filter((p) => Number.isFinite(p.coveragePercent) && Number.isFinite(p.riskPercent)) }))
  const geometryRows: DotIntervalDatum[] = visibleConditions.flatMap((row) => { const m = row.metrics ?? {}; const value = N(m.centerErrorPx ?? m.centerMaePx); return value === undefined ? [] : [{ id: row.conditionId, label: S(row.label) || row.conditionId, value }] })
  const diceRows: DotIntervalDatum[] = visibleConditions.flatMap((row) => { const m = row.metrics ?? {}; const value = N(m.dice); return value === undefined ? [] : [{ id: row.conditionId, label: S(row.label) || row.conditionId, value }] })
  const failures: TradeoffDatum[] = visibleConditions.flatMap((row) => {
    const m = row.metrics ?? {}
    const are = N(m.diameterArePercent ?? m.familyMacroDiameterArePercent ?? row.diameterArePercent)
    const tail = N(m.gt20FractionRetainedPercent ?? m.catastrophicFractionPercent ?? row.gt20FractionRetainedPercent)
    return are === undefined || tail === undefined ? [] : [{ id: row.conditionId, label: S(row.label) || row.conditionId, x: tail, y: are, coveragePercent: percent(row.coverage ?? row.coveragePercent), metadata: { methodId: row.methodId, accepted: N(row.accepted) ?? null, attempted: N(row.attempted) ?? null, condition: row.conditionId } }]
  })
  return <div className="route-page"><div className="route-heading"><div className="eyebrow">CORRECTED SHARED DEVELOPMENT POPULATION</div><h1>Published-method benchmark</h1><p>SegFormer B0, B1 and B2 are compared with established mouse-pupillometry approaches. Accuracy is conditional on accepted frames; availability is shown beside it.</p></div>
    <Section eyebrow="01 / PRIMARY RESULT" title="Accuracy and availability"><Figure number="1" title="Diameter error against retained-frame coverage"><AccuracyCoverageScatter points={points} onPointClick={(point) => onEvidence(S(point.metadata?.methodId) || point.id)} /></Figure><Figure number="2" title="Accuracy at practical coverage" note="Prospective operating points near or above the declared 95% attempted-frame coverage region. Intervals appear where the canonical family bootstrap supports them."><DotIntervalPlot rows={practical.filter((row) => row.value !== null)} valueLabel="Diameter ARE (%)" domain={[0, positiveCeiling(practical.flatMap((row) => [row.value, row.upper]))]} lowerIsBetter /><div className="coverage-exclusions">{(summary.figures?.practicalCoverage ?? []).filter((raw) => raw.reachesTarget === false).map((raw) => <div key={S(raw.id ?? raw.conditionId)}><b>{S(raw.label)}</b><span>Does not reach target coverage</span></div>)}</div></Figure><div className="table-intro"><b>Measured conditions</b><button onClick={() => setShowControls((value) => !value)}>{showControls ? 'Hide' : 'Show'} fairness and architecture controls</button></div><ValidationTable conditions={visibleConditions} /><button className="evidence-link" onClick={() => onEvidence()}>▾ Show visual comparison: source + GT + two methods</button></Section>
    <Section eyebrow="02 / FAILURE" title="Conditional error and severe failures">{failures.length ? <Figure number="3" title="Accuracy × &gt;20% error rate" note="Both axes are conditional on retained frames; points with different coverage remain labeled."><TradeoffScatter points={failures} xLabel="Retained frames with >20% diameter error (%)" yLabel="Family-macro diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(failures.map((row) => row.x))]} yDomain={[0, positiveCeiling(failures.map((row) => row.y))]} showFrontier onPointClick={(point) => onEvidence(S(point.metadata?.methodId) || point.id)} /></Figure> : <p className="scope-note">Comparable severe-error fractions are unavailable for this roster.</p>}</Section>
    <Section eyebrow="03 / MEASUREMENT" title="Measurement geometry">{geometryRows.length ? <Figure number="4" title="Center displacement on retained frames"><DotIntervalPlot rows={geometryRows} valueLabel="Center error (px)" domain={[0, positiveCeiling(geometryRows.map((row) => row.value), 1)]} lowerIsBetter /></Figure> : <p className="scope-note">Center error is listed in the technical rows where a compatible scored geometry plane exists.</p>}<p className="scope-note">Diameter is the primary measurement endpoint; area and axes remain in Methods & Data.</p></Section>
    <Section eyebrow="04 / MASK" title="Segmentation quality">{diceRows.length ? <Figure number="5" title="Pupil mask Dice"><DotIntervalPlot rows={diceRows} valueLabel="Dice" domain={[0, 1]} /></Figure> : <p className="scope-note">Mask comparison appears only for methods with actual compatible scored masks. Geometry-only techniques have no invented Dice value.</p>}</Section>
    <Section eyebrow="05 / RELIABILITY" title="Selective risk"><Figure number="6" title="Risk across coverage" note="Population curves from frozen threshold rows; alternate-threshold case decisions are unavailable for some methods."><RiskCoveragePlot curves={curves} /></Figure></Section>
  </div>
}
function StressTime({ tab, setTab, exact, severity, temporal, summary, onEvidence }: {
  tab: 'spatial' | 'temporal'
  setTab: (tab: 'spatial' | 'temporal') => void
  exact: Record<string, unknown>
  severity: ExactSeverityExport
  temporal: Record<string, unknown>
  summary?: OverviewExport
  onEvidence: (methodId?: string, caseIds?: string[]) => void
}) {
  const [selectedSeed, setSelectedSeed] = useState(() => new URLSearchParams(window.location.search).get('seed') || 'TMS01')
  const [spatialMethod, setSpatialMethod] = useState(() => new URLSearchParams(window.location.search).get('spatialMethod') || 'segformer_b2')
  const [selectedFamily, setSelectedFamily] = useState(() => new URLSearchParams(window.location.search).get('transform') || 'motion_blur')
  const [selectedSeverity, setSelectedSeverity] = useState(() => new URLSearchParams(window.location.search).get('severity') || '5')
  const [showArchitectureControl, setShowArchitectureControl] = useState(() => (new URLSearchParams(window.location.search).get('spatialMethod') || '').includes('unet'))
  const exactCards = (exact.cards ?? []) as MetricCard[]
  const temporalData = (temporal.data ?? {}) as Record<string, unknown>
  const temporalRows = (temporalData.perSeedObservations ?? []) as Array<Record<string, unknown>>
  const seeds = [...new Set(temporalRows.map((row) => S(row.seedId)).filter(Boolean))]
  const seedRows = temporalRows.filter((row) => S(row.seedId) === selectedSeed)
  const points: TemporalRmseGainDatum[] = seedRows.flatMap((row) => N(row.diameterRmsePx) !== undefined && N(row.sine3HzGain) !== undefined ? [{ id: `${S(row.methodId)}-${S(row.seedId)}`, label: S(row.methodId), rmse: N(row.diameterRmsePx)!, gain: N(row.sine3HzGain)!, coveragePercent: percent(row.meanSequenceCoverage), seed: S(row.seedId) }] : [])
  const lagGain: TradeoffDatum[] = seedRows.flatMap((row) => N(row.sine3HzPhaseLagSec) !== undefined && N(row.sine3HzGain) !== undefined ? [{ id: `${S(row.methodId)}-${S(row.seedId)}`, label: S(row.methodId), x: N(row.sine3HzPhaseLagSec)! * 1000, y: N(row.sine3HzGain)!, coveragePercent: percent(row.meanSequenceCoverage), comparisonGroup: selectedSeed, metadata: { methodId: S(row.methodId), seedId: selectedSeed, coveragePercent: percent(row.meanSequenceCoverage) ?? null, scoreSha256: S(row.scoreSha256) } }] : [])
  const methodIds = severity.methodIds.filter((id) => showArchitectureControl || !id.includes('unet'))
  const methodName = (id: string) => severity.rows.find((row) => row.methodId === id)?.method ?? id
  const selectedRows = severity.rows.filter((row) => row.methodId === spatialMethod)
  const heat: TransformSeverityCell[] = selectedRows.map((row) => ({ id: row.id, transform: row.operationFamily.replaceAll('_', ' '), severity: row.severity, value: row.value, accepted: row.accepted, attempted: row.attempted, status: row.status }))
  const familyRows = severity.rows.filter((row) => row.operationFamily === selectedFamily && methodIds.includes(row.methodId))
  const availableSeverities = [...new Set(familyRows.map((row) => String(row.severity)))].sort((a, b) => Number(a) - Number(b))
  const currentSeverity = availableSeverities.includes(selectedSeverity) ? selectedSeverity : availableSeverities[0]
  const response: TransformResponseSeries[] = methodIds.map((id) => ({ id, label: methodName(id), points: familyRows.filter((row) => row.methodId === id && N(Number(row.severity)) !== undefined).map((row) => ({ severity: Number(row.severity), value: row.value, accepted: row.accepted, attempted: row.attempted, caseId: row.caseIds[0] })) })).filter((series) => series.points.length > 1)
  const cleanByMethod = new Map((summary ? getFigurePoints(summary) : []).filter((point) => point.id.includes('__shared_scalar_mask_gt') || point.id.includes('official_mapping_fixed')).map((point) => [S(point.metadata?.methodId) || point.id.split('__')[0], point]))
  const robustness: TradeoffDatum[] = familyRows.filter((row) => String(row.severity) === currentSeverity).flatMap((row) => {
    const clean = cleanByMethod.get(row.methodId)
    return clean && row.value !== null ? [{ id: row.id, label: row.method, x: clean.accuracyPercent, y: row.value, coveragePercent: row.coverage * 100, comparisonGroup: `${selectedFamily}:${currentSeverity}`, metadata: { methodId: row.methodId, realCoveragePercent: clean.coveragePercent, exactRetained: row.accepted, exactAttempted: row.attempted, source: row.sourceRefs[0]?.path } }] : []
  })
  const selectedRowForCell = (cell: TransformSeverityCell) => selectedRows.find((row) => row.id === cell.id)
  return <div className="route-page">
    <div className="route-heading"><div className="eyebrow">FROZEN EXACT-GT DEVELOPMENT PROTOCOLS</div><h1>Robustness & time</h1><p>Spatial perturbations and temporal trajectories are separate controlled tests.</p><div className="subtabs"><button className={tab === 'spatial' ? 'selected' : ''} onClick={() => setTab('spatial')}>V2.1 spatial</button><button className={tab === 'temporal' ? 'selected' : ''} onClick={() => setTab('temporal')}>V2.2 temporal</button></div></div>
    {tab === 'spatial' ? <>
      <Section eyebrow={`EXACT-GT V2.1 · ${severity.caseCount} IDENTICAL FROZEN CASES`} title="Transform response" lead="Each value is mean diameter ARE on accepted frames within one source-defined operation and severity cell. Coverage and counts remain attached; no interval is invented.">
        <div className="coverage-filter"><label htmlFor="spatial-method">Method</label><select id="spatial-method" value={spatialMethod} onChange={(event) => { setSpatialMethod(event.target.value); setSharedState({ spatialMethod: event.target.value }) }}>{methodIds.map((id) => <option key={id} value={id}>{methodName(id)}</option>)}</select><label className="check-option"><input type="checkbox" checked={showArchitectureControl} onChange={(event) => setShowArchitectureControl(event.target.checked)} /> Show architecture control</label></div>
        <Figure number="7" title="Operation family × source severity" note="Blur levels are kernel length in pixels; occlusion and crop levels are visible fractions; combined pupil is one categorical condition. Blank cells mean that operation has no such source level. Click a measured cell for an indexed matching case."><TransformSeverityHeatmap rows={heat} metricLabel="Diameter ARE (%)" onCellSelect={(cell) => { const row = selectedRowForCell(cell); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure>
        <p className="scope-note">The frozen corpus contains blur, latent occlusion, crop/truncation, and a combined pupil-local transform. Standalone noise, glare, ROI-shift, translation and scale sweeps are not present and are not inferred.</p>
      </Section>
      <Section eyebrow="SEVERITY RESPONSE" title="How error changes with perturbation">
        <div className="coverage-filter"><label htmlFor="spatial-family">Operation family</label><select id="spatial-family" value={selectedFamily} onChange={(event) => { setSelectedFamily(event.target.value); setSelectedSeverity(''); setSharedState({ transform: event.target.value, severity: undefined }) }}>{severity.operationFamilies.map((family) => <option key={family} value={family}>{family.replaceAll('_', ' ')}</option>)}</select><label htmlFor="spatial-severity">Severity</label><select id="spatial-severity" value={currentSeverity} onChange={(event) => { setSelectedSeverity(event.target.value); setSharedState({ severity: event.target.value }) }}>{availableSeverities.map((level) => <option key={level} value={level}>{level} {selectedFamily === 'motion_blur' ? 'px kernel' : selectedFamily === 'combined_pupil' ? 'compound' : 'visible fraction'}</option>)}</select></div>
        {response.length ? <Figure number="8" title="Source-defined response curve" note="Methods share the frozen execution rows within this family. The line connects only source-defined numeric levels; the compound transform has no invented ordinal curve."><TransformResponseCurve series={response} xLabel={selectedFamily === 'motion_blur' ? 'Blur kernel length (px)' : 'Target visible fraction'} yLabel="Diameter ARE (%)" yDomain={[0, positiveCeiling(response.flatMap((series) => series.points.map((point) => point.value)))]} onPointSelect={(point, series) => { const row = familyRows.find((item) => item.methodId === series.id && Number(item.severity) === point.severity); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure> : <p className="scope-note">This source-defined condition has one categorical level; no response curve is drawn.</p>}
        {robustness.length > 1 && <Figure number="9" title="Clean real-validation error × selected Exact-GT error" note="The axes come from distinct frozen development protocols. Each mark combines the same method's conditional diameter ARE with its selected perturbation cell; coverage differs by protocol."><TradeoffScatter points={robustness} xLabel="Clean real-validation diameter ARE (%)" yLabel="Selected Exact-GT diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(robustness.map((row) => row.x))]} yDomain={[0, positiveCeiling(robustness.map((row) => row.y))]} showFrontier onPointClick={(point) => { const row = familyRows.find((item) => item.id === point.id); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure>}
      </Section>
      <Section title="How exact GT is defined"><div className="semantic-grid"><p><b>Nuisance transforms.</b> Ground truth remains unchanged when only image appearance changes.</p><p><b>Geometric transforms.</b> Image and GT transform together.</p><p><b>Occlusion.</b> Latent full-pupil GT or visible GT is specified by the source condition.</p><p><b>Crop and truncation.</b> Interpret valid extent and acceptance with the exported condition.</p></div></Section>
      <details><summary>Pooled spatial summaries</summary><div className="compact-metrics">{exactCards.filter((c) => /-mean$|-coverage$/.test(c.id)).map((c) => <div key={c.id}><b>{c.title}</b><span>{valueMethods(c).length} measured conditions</span></div>)}</div></details>
    </> : <>
      <Section eyebrow="EXACT-GT V2.2 · PREDICTION-BLIND SEEDS · 18 TRAJECTORIES PER SEED · 96 FRAMES PER TRAJECTORY" title="No conjunctive temporal-fidelity winner established" lead="Error, 3-Hz response, phase and coverage must be read together for a selected prediction-blind seed."><div className="coverage-filter"><label htmlFor="temporal-seed">Seed</label><select id="temporal-seed" value={selectedSeed} onChange={(event) => { setSelectedSeed(event.target.value); setSharedState({ seed: event.target.value }) }}>{seeds.map((seed) => <option key={seed} value={seed}>{seed}</option>)}</select></div><div className="figure-pair"><Figure number="10" title="RMSE versus 3-Hz gain" note="Gain target is 1. Low RMSE can coincide with response attenuation; each mark is a method on the selected seed."><TemporalRmseGainScatter points={points} /></Figure><Figure number="11" title="Phase lag versus 3-Hz gain" note="Ideal response is lag 0 ms and gain 1. The observed frontier is within the selected seed only."><TradeoffScatter points={lagGain} xLabel="3-Hz phase lag (ms)" yLabel="3-Hz gain" xDirection="target" xTarget={0} yDirection="target" yTarget={1} showFrontier onPointClick={(point) => onEvidence(S(point.metadata?.methodId))} /></Figure></div><button className="evidence-link" onClick={() => onEvidence()}>▾ Show synchronized source and traces</button></Section><Section title="Frequency and event response"><p className="scope-note">The current public score export supports the measured 3-Hz gain and phase observations above. Multi-frequency transfer curves and synchronized event traces are unavailable in this export.</p></Section>
    </>}
  </div>
}
function SpeedDeployment({ runtime, deployment, nativeCpu, onEvidence }: { runtime: MetricCard[]; deployment: MetricCard[]; nativeCpu: NativeCpuRuntimeExport; onEvidence: (methodId?: string) => void }) {
  const [minimumCoverage, setMinimumCoverage] = useState(() => Number(new URLSearchParams(window.location.search).get('minCoverage')) || 95)
  const p50 = card(runtime, 'runtime-common-end_to_end_p50_ms')
  const p95 = card(runtime, 'runtime-common-end_to_end_p95_ms')
  const rows: RuntimeIntervalDatum[] = valueMethods(p50).map((m) => ({ id: m.methodId, label: methodLabel(m), endToEndP50Ms: N(m.value) ?? null, endToEndP95Ms: N(p95?.methods?.find((r) => r.methodId === m.methodId)?.value) ?? null, color: m.color }))
  const nativeRows: RuntimeIntervalDatum[] = nativeCpu.conditions.map((condition) => ({ id: condition.conditionId, label: condition.method, endToEndP50Ms: condition.endToEndP50Ms, endToEndP95Ms: condition.endToEndP95Ms, detail: `${condition.nativeParityMode.replaceAll('_', ' ').toLowerCase()}; initialization ${fmt(condition.initializationMs)} ms` }))
  const deployed: Record<string, DeploymentMatrixRow> = {}
  const keys = [['deployment-pure_model_latency_p50_ms', 'modelOnlyP50Ms'], ['deployment-end_to_end_latency_p50_ms', 'endToEndP50Ms'], ['deployment-coverage', 'coveragePercent'], ['deployment-acquisition_family_macro_diameter_ARE', 'diameterArePercent']] as const
  keys.forEach(([id, key]) => card(deployment, id)?.methods?.forEach((m) => {
    const status = m.status ?? ''
    const row = deployed[m.methodId] ?? {
      id: m.methodId, model: m.architecture ?? m.variant ?? m.methodId,
      backend: m.backend ?? '', precision: m.precision ?? '',
      gateStatus: /FAIL COVERAGE|MEASURED_FAIL_95PCT/.test(status) ? 'executed-failed' : /FAIL/.test(status) ? 'fail' : /PASS/.test(status) ? 'pass' : 'unknown',
      gateLabel: /FAIL COVERAGE|MEASURED_FAIL_95PCT/.test(status) ? 'Executed — failed ≥95% coverage gate' : /PASS/.test(status) ? 'Passed ≥95% coverage gate' : status,
    }
    ;(row as unknown as Record<string, unknown>)[key] = key === 'coveragePercent' || key === 'diameterArePercent' ? percent(m.value) : N(m.value)
    deployed[m.methodId] = row
  }))
  const vram = card(deployment, 'deployment-peak_PyTorch_allocated_VRAM_bytes')
  const engine = card(deployment, 'deployment-persistent_engine_bytes')
  const checkpoint = card(deployment, 'deployment-training_checkpoint_bytes')
  Object.values(deployed).forEach((row) => {
    const vramBytes = N(vram?.methods?.find((m) => m.methodId === row.id)?.value)
    const engineBytes = N(engine?.methods?.find((m) => m.methodId === row.id)?.value)
    const checkpointBytes = N(checkpoint?.methods?.find((m) => m.methodId === row.id)?.value)
    row.vramMb = vramBytes === undefined ? null : vramBytes / 1_000_000
    row.modelSizeMb = (engineBytes ?? checkpointBytes) === undefined ? null : (engineBytes ?? checkpointBytes)! / 1_000_000
    row.detail = engineBytes === undefined ? 'Size is the training checkpoint; no persistent engine is exported.' : 'Size is the persistent TensorRT engine.'
    const baseline = deployed[`segformer_${row.model.toLowerCase()}__pytorch_fp32`]
    row.accuracyDeltaPp = row.diameterArePercent === null || row.diameterArePercent === undefined || baseline?.diameterArePercent === null || baseline?.diameterArePercent === undefined
      ? null : row.diameterArePercent - baseline.diameterArePercent
  })
  const variants = Object.values(deployed)
  const colors: Record<string, string> = { B0: '#598e9b', B1: '#287089', B2: '#174b73' }
  const frontier: DeploymentFrontierDatum[] = variants.map((row) => ({
    id: row.id, label: `${row.model} · ${row.backend} ${row.precision}`,
    latencyMs: row.endToEndP50Ms ?? null, diameterArePercent: row.diameterArePercent ?? null,
    coveragePercent: row.coveragePercent ?? null, color: colors[row.model] ?? '#245d77',
    status: row.gateLabel,
    metadata: { model: row.model, backend: row.backend, precision: row.precision,
      modelOnlyP50Ms: row.modelOnlyP50Ms ?? null, endToEndP50Ms: row.endToEndP50Ms ?? null,
      coveragePercent: row.coveragePercent ?? null, diameterArePercent: row.diameterArePercent ?? null,
      qualification: row.gateLabel },
  }))
  const resourcePoints = (field: 'modelSizeMb' | 'vramMb'): TradeoffDatum[] => variants.filter((row) => N(row[field]) !== undefined && N(row.diameterArePercent) !== undefined).map((row) => ({ id: row.id, label: `${row.model} · ${row.backend} ${row.precision}`, x: row[field] ?? null, y: row.diameterArePercent ?? null, coveragePercent: row.coveragePercent ?? null, color: colors[row.model] ?? '#245d77', status: row.gateLabel, comparisonGroup: 'measured deployment', metadata: { model: row.model, backend: row.backend, precision: row.precision, qualification: row.gateLabel } }))
  return <div className="route-page"><div className="route-heading"><div className="eyebrow">MEASURED BACKEND × PRECISION CONDITIONS</div><h1>SegFormer deployment frontier</h1><p>How much end-to-end speed do B0, B1 and B2 gain across PyTorch, Inductor and TensorRT, and what happens to measurement error and accepted-frame coverage?</p></div>
    <Section eyebrow="01 / SCIENTIFIC FRONTIER" title="Speed, accuracy and coverage" lead="Each mark is one measured deployment condition nested under its SegFormer model. Precision can alter outputs and coverage; measured effects are shown without assuming a direction."><div className="coverage-filter"><label htmlFor="deployment-min-coverage">Minimum coverage</label><select id="deployment-min-coverage" value={minimumCoverage} onChange={(event) => { setMinimumCoverage(Number(event.target.value)); setSharedState({ minCoverage: event.target.value }) }}>{[50,80,90,95,99].map((value) => <option key={value} value={value}>{value}%</option>)}</select></div><div className="figure-pair"><Figure number="D1" title="Diameter error × end-to-end latency" note="Lower-left is preferable within the measured deployment protocol. Failed-gate conditions remain visible."><DeploymentFrontierScatter points={frontier} view="latency-accuracy" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id)} /></Figure><Figure number="D2" title="Coverage × end-to-end latency" note="The horizontal line is the frozen ≥95% coverage gate. INT8 was executed for all three SegFormer models."><DeploymentFrontierScatter points={frontier} view="latency-coverage" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id)} /></Figure></div></Section>
    <Section eyebrow="02 / VERIFIED COMMON PROTOCOL" title="Common A5000 batch-one runtime" lead="End-to-end p50 and p95 for the verified comparable method subset; repeated timed calls are not independent biological samples."><Figure number="D3" title="End-to-end latency quantiles" note="Nine common-protocol methods. p50 and p95 are timed-call quantiles, not confidence intervals."><RuntimeIntervalPlot rows={rows} timing="endToEnd" protocol="Common A5000, batch one" /></Figure></Section>
    <Section eyebrow="03 / SEPARATE WORKFLOW" title="Native CPU runtime" lead={`Eight measured methods on the same ${nativeCpu.hardware.machine} CPU and frozen ${nativeCpu.sharedStreamSamples}-sample stream, batch one. This is a separate protocol from the common CUDA A5000 timing.`}><Figure number="D4" title="Native CPU end-to-end latency quantiles" note="p50 and p95 summarize timed calls on the frozen stream; the span is not a biological confidence interval. Native Python environments, parity modes, stateful conditions and initialization remain method-specific."><RuntimeIntervalPlot rows={nativeRows} timing="endToEnd" protocol={`${nativeCpu.hardware.platform}, batch one · ${nativeCpu.sharedStreamSamples} frozen samples`} /></Figure><details><summary>Methods without verified native CPU timing</summary><p className="scope-note">N/A in this native population: {nativeCpu.excludedMethods.map((method) => method.methodId.replaceAll('_', ' ')).join(', ')}. These methods are not assigned synthetic native times.</p></details></Section>
    <Section eyebrow="04 / COMPLETE MEASUREMENTS" title="Backend and precision detail"><p className="section-lead">Model-only and end-to-end p50 are separate. All {variants.length} executed or measured B0/B1/B2 conditions remain in the table, including failed coverage gates.</p><DeploymentMatrix rows={variants} /><details><summary>Resource tradeoffs: size and VRAM</summary><div className="figure-pair"><Figure number="D5" title="Stored model size × diameter error" note="Engine bytes where exported; otherwise training-checkpoint bytes. Marker size reflects accepted-frame coverage. Compare storage definitions in the table."><TradeoffScatter points={resourcePoints('modelSizeMb')} xLabel="Engine or checkpoint size (MB)" yLabel="Diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(resourcePoints('modelSizeMb').map((point) => point.x))]} yDomain={[0, positiveCeiling(resourcePoints('modelSizeMb').map((point) => point.y))]} coverageThresholdPercent={95} onPointClick={(point) => onEvidence(point.id)} /></Figure><Figure number="D6" title="Peak allocated VRAM × diameter error" note="Only conditions with recorded PyTorch allocated VRAM are plotted; missing VRAM remains N/A in the complete table."><TradeoffScatter points={resourcePoints('vramMb')} xLabel="Peak PyTorch allocated VRAM (MB)" yLabel="Diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(resourcePoints('vramMb').map((point) => point.x), 100)]} yDomain={[0, positiveCeiling(resourcePoints('vramMb').map((point) => point.y))]} coverageThresholdPercent={95} onPointClick={(point) => onEvidence(point.id)} /></Figure></div></details></Section>
  </div>
}
function MethodsData({ manifest, summary, validation, showExplorer, setShowExplorer, fullData }: { manifest: Record<string, unknown>; summary?: OverviewExport; validation?: ValidationExport; showExplorer: boolean; setShowExplorer: (value: boolean) => void; fullData?: BenchmarkData }) {
  const files = (manifest.files ?? {}) as Record<string, { sha256?: string; sizeBytes?: number }>
  const [technicalCategory, setTechnicalCategory] = useState<string>('real_validation')
  return <div className="route-page"><div className="route-heading"><div className="eyebrow">DEFINITIONS · PROVENANCE · DOWNLOADS</div><h1>Methods & data</h1><p>Scientific condition identity, estimands and exact export sources.</p></div><Section title="Reading the benchmark"><div className="semantic-grid"><p><b>Population.</b> Corrected shared development validation population, grouped by acquisition family. Biological mouse IDs are unavailable in the legacy set.</p><p><b>Estimand.</b> Family-macro diameter ARE is conditional on accepted frames. Coverage uses attempted frames.</p><p><b>Uncertainty.</b> Bootstrap intervals resample acquisition families. They do not include training-seed variation.</p><p><b>Condition identity.</b> Family → model → representation → operating point → backend → precision. Deployment variants remain nested under their scientific model.</p></div></Section><Section title="Export identity"><dl className="export-identity"><div><dt>Status</dt><dd>{S(manifest.status) || 'Development'}</dd></div><div><dt>External evaluation</dt><dd>{S(manifest.externalEvaluation) || 'Not opened'}</dd></div><div><dt>Version</dt><dd>{S(manifest.version)}</dd></div><div><dt>Source fingerprint</dt><dd><code>{S(manifest.sourceFingerprintSha256)}</code></dd></div></dl><details><summary>File hashes and sizes</summary><div className="hash-table">{Object.entries(files).map(([name, meta]) => <div key={name}><a href={`${import.meta.env.BASE_URL}data/${name}`} download>{name}</a><code>{meta.sha256 ?? 'N/A'}</code><span>{fmt(meta.sizeBytes, 0)} bytes</span></div>)}</div></details></Section><Section title="Architecture controls" lead="Matched U-Net small, base and B2-scale conditions test whether an ordinary convolutional model performs similarly under the same training regime. The paired seven-family interval crosses zero for the matched B2-scale comparison; this control does not support intrinsic architecture superiority.">{summary && <Figure number="S1" title="Paired U-Net − SegFormer B2 difference" note="Acquisition-family bootstrap interval; training-seed variability is not represented."><PairedDifferenceForest rows={getPaired(summary)} /></Figure>}{validation && <ValidationTable conditions={validation.conditions.filter((row) => /u.?net/i.test(S(row.family)) || /segformer.*b2/i.test(`${S(row.family)} ${S(row.model)}`))} />}</Section><Section title="Full technical explorer"><p>Complete exported metrics and capability definitions are available for forensic review.</p><button className="evidence-link" onClick={() => setShowExplorer(!showExplorer)}>{showExplorer ? 'Hide' : 'Open'} full technical explorer</button>{showExplorer && !fullData && <Loading label="technical explorer" />}{showExplorer && fullData && <div className="technical-explorer"><div className="explorer-tabs">{Object.entries(fullData.cardsByCategory).filter(([key]) => key !== 'capabilities').map(([key, cards]) => <button key={key} className={technicalCategory === key ? 'selected' : ''} onClick={() => setTechnicalCategory(key)}>{key.replaceAll('_', ' ')} · {cards.length}</button>)}<button className={technicalCategory === 'capabilities' ? 'selected' : ''} onClick={() => setTechnicalCategory('capabilities')}>Capabilities · {fullData.capabilityMatrix.length}</button></div>{technicalCategory === 'capabilities' ? <CapabilityMatrix definitions={fullData.capabilityMatrix} identities={fullData.methods} query="" /> : fullData.cardsByCategory[technicalCategory as keyof typeof fullData.cardsByCategory]?.map((c) => <MetricCardView key={c.id} card={c} data={fullData} identities={fullData.methods} flags={{ representations: false, deployments: false }} />)}</div>}</Section><Section title="Downloads"><div className="download-links"><a href={`${import.meta.env.BASE_URL}data/benchmark_manifest.json`} download>Benchmark manifest ↗</a><a href={`${import.meta.env.BASE_URL}data/real_validation_v2.json`} download>Unified real-validation rows ↗</a><a href={`${import.meta.env.BASE_URL}data/provenance.json`} download>Full provenance ↗</a></div></Section></div>
}
function App() {
  const [route, setRoute] = useState<RouteId>(hashRoute)
  const [overview, setOverview] = useState<OverviewExport>()
  const [validation, setValidation] = useState<ValidationExport>()
  const [risk, setRisk] = useState<MetricCard[]>()
  const [exact, setExact] = useState<Record<string, unknown>>()
  const [exactSeverity, setExactSeverity] = useState<ExactSeverityExport>()
  const [temporal, setTemporal] = useState<Record<string, unknown>>()
  const [runtime, setRuntime] = useState<MetricCard[]>()
  const [nativeCpu, setNativeCpu] = useState<NativeCpuRuntimeExport>()
  const [deployment, setDeployment] = useState<MetricCard[]>()
  const [manifest, setManifest] = useState<Record<string, unknown>>()
  const [fullData, setFullData] = useState<BenchmarkData>()
  const [showExplorer, setShowExplorer] = useState(false)
  const [stressTab, setStressTab] = useState<'spatial' | 'temporal'>(new URLSearchParams(window.location.search).get('view') === 'temporal' ? 'temporal' : 'spatial')
  const [evidenceOpen, setEvidenceOpen] = useState(new URLSearchParams(window.location.search).get('evidence') === '1')
  const [evidenceMethodId, setEvidenceMethodId] = useState<string | undefined>(new URLSearchParams(window.location.search).get('compare')?.split(',')[0] || undefined)
  const [evidenceComparatorId, setEvidenceComparatorId] = useState<string | undefined>(new URLSearchParams(window.location.search).get('compare')?.split(',')[1] || undefined)
  const [caseIndex, setCaseIndex] = useState<CaseIndexEntry[]>()
  const [preferredCaseIds, setPreferredCaseIds] = useState<string[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState(new URLSearchParams(window.location.search).get('case') || '')
  const [visualCases, setVisualCases] = useState<VisualCase[]>()
  const [error, setError] = useState<unknown>()
  useEffect(() => { const handle = () => { setRoute(hashRoute()); window.scrollTo(0, 0) }; window.addEventListener('hashchange', handle); return () => window.removeEventListener('hashchange', handle) }, [])
  useEffect(() => { getJson<OverviewExport>('overview_v2.json').then(setOverview).catch(setError) }, [])
  useEffect(() => {
    if (route === 'published-method-benchmark') Promise.all([getJson<ValidationExport>('real_validation_v2.json'), getCards('coverage_risk.json')]).then(([v, r]) => { setValidation(v); setRisk(r) }).catch(setError)
    if (route === 'robustness-time') Promise.all([getJson<Record<string, unknown>>('exact_gt.json'), getJson<Record<string, unknown>>('temporal.json'), getJson<ExactSeverityExport>('exact_gt_severity_v2.json')]).then(([e, t, s]) => { setExact(e); setTemporal(t); setExactSeverity(s) }).catch(setError)
    if (route === 'segformer-deployment') Promise.all([getCards('runtime.json'), getCards('deployment.json'), getJson<NativeCpuRuntimeExport>('native_cpu_runtime_v2.json')]).then(([r, d, n]) => { setRuntime(r); setDeployment(d); setNativeCpu(n) }).catch(setError)
    if (route === 'methods-data') Promise.all([getJson<Record<string, unknown>>('benchmark_manifest.json'), getJson<ValidationExport>('real_validation_v2.json')]).then(([m, v]) => { setManifest(m); setValidation(v) }).catch(setError)
  }, [route])
  useEffect(() => { if (showExplorer && !fullData) loadBenchmarkData().then(setFullData).catch(setError) }, [showExplorer, fullData])
  useEffect(() => {
    if (!evidenceOpen) return
    if (!validation) getJson<ValidationExport>('real_validation_v2.json').then(setValidation).catch(setError)
    getJson<{ cases?: CaseIndexEntry[] } | CaseIndexEntry[]>('visual_case_index_v2.json').then((index) => {
      const entries = Array.isArray(index) ? index : index.cases ?? []
      setCaseIndex(entries)
      const category = route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation'
      const relevant = entries.filter((item) => item.category === category)
      const requestedCaseId = new URLSearchParams(window.location.search).get('case')
      const selected = relevant.find((item) => item.id === requestedCaseId)
        ?? relevant.find((item) => preferredCaseIds.includes(item.id))
        ?? relevant.find((item) => item.mode === 'representative' || item.mode === undefined)
        ?? relevant[0]
      if (!selected) { setVisualCases([]); return }
      setSelectedCaseId(selected.id)
      setSharedState({ case: selected.id })
      return getCase(selected).then((item) => setVisualCases([item]))
    }).catch(setError)
  }, [evidenceOpen, route, stressTab, validation, preferredCaseIds])
  useEffect(() => {
    if (!evidenceOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setEvidenceOpen(false); setSharedState({ evidence: undefined }) } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [evidenceOpen])
  const go = (id: RouteId) => { if (route !== id) { window.location.hash = id; setRoute(id) } window.scrollTo({ top: 0, behavior: 'instant' }) }
  const openEvidence = (methodId?: string, caseIds: string[] = []) => { const a = methodId || 'segformer_b2'; const b = a === 'segformer_b2' ? 'meye_released' : 'segformer_b2'; setEvidenceMethodId(a); setEvidenceComparatorId(b); setPreferredCaseIds(caseIds); setVisualCases(undefined); setEvidenceOpen(true); setSharedState({ evidence: '1', compare: `${a},${b}`, case: caseIds.length ? undefined : new URLSearchParams(window.location.search).get('case') ?? undefined }) }
  const selectCase = (id: string) => {
    const selected = caseIndex?.find((item) => item.id === id)
    if (!selected) return
    setSelectedCaseId(id)
    setSharedState({ case: id })
    setVisualCases(undefined)
    getCase(selected).then((item) => setVisualCases([item])).catch(setError)
  }
  const evidenceCard = useMemo(() => ({ id: route === 'robustness-time' ? stressTab === 'spatial' ? 'exact-gt-diameter_are-mean' : 'temporal-sine3HzGain' : route === 'segformer-deployment' ? 'deployment-accuracy-coverage' : 'real-validation-family-macro-diameter-are', title: route === 'robustness-time' ? 'Exact-GT visual evidence' : route === 'segformer-deployment' ? 'Selected deployment condition' : 'Diameter evidence', category: route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation', overlayType: route === 'robustness-time' && stressTab === 'temporal' ? 'temporal' : 'diameter' }) as MetricCard, [route, stressTab])
  const evidenceMethods = useMemo(() => {
    const unique = new Map<string, MethodRecord>()
    for (const condition of validation?.conditions ?? []) {
      if (condition.methodId && !unique.has(condition.methodId)) unique.set(condition.methodId, { methodId: condition.methodId, methodName: condition.label ?? [condition.family, condition.model].filter(Boolean).join(' '), family: condition.family })
    }
    for (const method of card(deployment ?? [], 'deployment-coverage')?.methods ?? []) {
      if (!unique.has(method.methodId)) unique.set(method.methodId, { methodId: method.methodId, methodName: methodLabel(method), family: method.family })
    }
    return [...unique.values()]
  }, [validation, deployment])
  return <div className="redesign-shell"><header className="redesign-header"><div className="header-inner"><a href="#overview" className="brand" onClick={(e) => { e.preventDefault(); go('overview') }}><span className="brand-mark">◉</span><span>Mouse Pupillometry<br /><b>Benchmark</b></span></a><div className="header-status"><b>Development benchmark</b><span>{fmt(overview?.population?.acquisitionFamilyCount, 0)} acquisition families · {fmt(overview?.population?.validationFrameCount, 0)} validation frames</span><span>External evaluation unopened · final model selection pending</span></div></div><nav className="redesign-nav" aria-label="Primary destinations">{NAV.map((item) => <button key={item.id} aria-current={route === item.id ? 'page' : undefined} className={route === item.id ? 'active' : ''} onClick={() => go(item.id)}>{item.label}</button>)}</nav></header><main id="main-content">{Boolean(error) && <ErrorState error={error} />}{route === 'overview' && (overview ? <Overview data={overview} onEvidence={openEvidence} go={go} /> : <Loading label="overview" />)}{route === 'published-method-benchmark' && (overview && validation && risk ? <RealValidation summary={overview} conditions={validation.conditions} risk={risk} onEvidence={openEvidence} /> : <Loading label="real validation" />)}{route === 'robustness-time' && (exact && exactSeverity && temporal ? <StressTime tab={stressTab} setTab={(tab) => { setStressTab(tab); setSharedState({ view: tab }) }} exact={exact} severity={exactSeverity} temporal={temporal} summary={overview} onEvidence={openEvidence} /> : <Loading label="stress and temporal data" />)}{route === 'segformer-deployment' && (runtime && deployment && nativeCpu ? <SpeedDeployment runtime={runtime} deployment={deployment} nativeCpu={nativeCpu} onEvidence={openEvidence} /> : <Loading label="speed and deployment data" />)}{route === 'methods-data' && (manifest ? <MethodsData manifest={manifest} summary={overview} validation={validation} showExplorer={showExplorer} setShowExplorer={setShowExplorer} fullData={fullData} /> : <Loading label="methods and data" />)}{evidenceOpen && <div className="evidence-modal-backdrop" role="presentation" onClick={() => { setEvidenceOpen(false); setSharedState({ evidence: undefined }) }}><div className="evidence-modal" role="dialog" aria-modal="true" aria-label="Visual comparison" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>Visual comparison</h2><button onClick={() => { setEvidenceOpen(false); setSharedState({ evidence: undefined }) }}>Close ×</button></div>{visualCases !== undefined ? <EvidenceViewer key={selectedCaseId} card={evidenceCard} methods={evidenceMethods} identities={[]} cases={visualCases} initialMethodAId={evidenceMethodId} initialMethodBId={evidenceComparatorId} initialCaseId={selectedCaseId} onMethodsChange={(a, b) => { setEvidenceMethodId(a); setEvidenceComparatorId(b); setSharedState({ compare: `${a},${b}` }) }} /> : <Loading label="selected source case" />}{caseIndex && <div className="case-count"><label htmlFor="evidence-case">Frozen case</label><select id="evidence-case" value={selectedCaseId} onChange={(event) => selectCase(event.target.value)}>{caseIndex.filter((c) => c.category === (route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation')).map((c) => <option key={c.id} value={c.id}>{c.label || c.id.slice(0, 12)} · {c.mode === 'worst_case' ? 'outcome-selected QC' : 'representative'}</option>)}</select><span>{caseIndex.filter((c) => c.category === (route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation')).length} frozen cases indexed. Media loads for the selected case only.</span></div>}</div></div>}</main><footer className="redesign-footer"><span>Mouse Pupillometry Benchmark · development evidence</span><button onClick={() => go('methods-data')}>Sources and data →</button></footer></div>
}
export default App
