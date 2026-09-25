import { useEffect, useMemo, useRef, useState } from 'react'
import EvidenceViewer from './EvidenceViewer'
import MetricCardView from './MetricCardView'
import CapabilityMatrix from './CapabilityMatrix'
import {
  DeploymentFrontierScatter,
  DeploymentMatrix,
  PairedDifferenceForest,
  RiskCoveragePlot,
  TradeoffScatter,
  TemporalRmseGainScatter,
  TransformSeverityHeatmap,
  TransformResponseCurve,
} from './ScientificFigures'
import type { AccuracyCoverageDatum, DeploymentFrontierDatum, DeploymentMatrixRow, PairedDifferenceDatum, RiskCoverageSeries, TemporalRmseGainDatum, TradeoffDatum, TransformSeverityCell, TransformResponseSeries } from './ScientificFigures'
import { loadBenchmarkData } from './data'
import { getCards, getCase, getJson, setSharedState } from './v2Data'
import VerticalBarChart, { type VerticalBarDatum } from './VerticalBarChart'
import { methodColor, methodOrder, METHOD_PALETTE } from './palette'
import type { CaseIndexEntry, ExactSeverityExport, NativeCpuRuntimeExport, OverviewExport, RouteId, ValidationCondition, ValidationExport } from './v2Data'
import type { BenchmarkData, MetricCard, MethodRecord, VisualCase } from './types'

const NAV: Array<{ id: RouteId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'published-method-benchmark', label: 'Published methods' },
  { id: 'robustness-time', label: 'Robustness & time' },
  { id: 'segformer-deployment', label: 'SegFormer deployment' },
  { id: 'methods-data', label: 'Methods & data' },
]
type EvidenceMetric = 'diameter' | 'center' | 'area' | 'mask' | 'boundary' | 'coverage' | 'runtime' | 'temporal'
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
    color: methodColor(S(raw.methodId), S(raw.family)), family: S(raw.family) || undefined,
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
    color: METHOD_PALETTE.unet,
    detail: S(raw.detail) || undefined,
  })).filter((row) => [row.difference, row.lower, row.upper].every(Number.isFinite))
}
function orderedFigurePoints(points: AccuracyCoverageDatum[]) {
  return [...points].sort((a, b) => methodOrder(S(a.metadata?.methodId) || a.id, a.family) - methodOrder(S(b.metadata?.methodId) || b.id, b.family) || a.label.localeCompare(b.label))
}
function useOperatingPoint(points: AccuracyCoverageDatum[], matched: boolean) {
  return orderedFigurePoints(points.filter((point) => {
    const methodId = S(point.metadata?.methodId)
    if (methodId !== 'standard_dlc_matched' && methodId !== 'pupil_dlc_gm') return true
    const prospective = /prospective|95pct|≥95/i.test(`${point.id} ${point.operatingPoint ?? ''}`)
    return matched ? prospective : !prospective
  }))
}
function chartMethodLabel(methodId: string, label: string, operatingPoint?: string) {
  const prospective = /prospective|95pct|≥95/i.test(operatingPoint ?? '')
  if (methodId === 'segformer_b0') return 'SegFormer B0'
  if (methodId === 'segformer_b1') return 'SegFormer B1'
  if (methodId === 'segformer_b2') return 'SegFormer B2'
  if (methodId === 'standard_dlc_matched') return prospective ? 'DeepLabCut · 95%' : 'DeepLabCut'
  if (methodId === 'pupil_dlc_gm') return prospective ? 'Pupil-DLC · 95%' : 'Pupil-DLC GM'
  if (methodId === 'dlc_zoo_mouse_pupil_vclose') return 'DLC Model Zoo'
  if (methodId === 'meye_released') return 'MEYE'
  if (methodId === 'neuropupil_animal') return 'NeuroPupil'
  if (methodId === 'mouse_pupil_analysis_v020') return 'Mouse pupil analysis'
  if (methodId === 'classical_fixed') return 'Classical ellipse'
  if (/u.?net/i.test(methodId)) return label.replace('U-Net', 'U-Net')
  return label
}
function accuracyBarRows(points: AccuracyCoverageDatum[]): VerticalBarDatum[] {
  return points.map((point) => ({
    id: S(point.metadata?.methodId) || point.id,
    label: chartMethodLabel(S(point.metadata?.methodId) || point.id, point.label, point.operatingPoint),
    value: point.accuracyPercent,
    lower: point.accuracyLowerPercent,
    upper: point.accuracyUpperPercent,
    coveragePercent: point.coveragePercent,
    color: point.color,
    family: point.family,
    detail: [point.label, point.operatingPoint, point.representation].filter(Boolean).join(' · '),
  }))
}
function coverageBarRows(points: AccuracyCoverageDatum[]): VerticalBarDatum[] {
  return points.map((point) => ({
    id: S(point.metadata?.methodId) || point.id,
    label: chartMethodLabel(S(point.metadata?.methodId) || point.id, point.label, point.operatingPoint),
    value: point.coveragePercent,
    color: point.color,
    family: point.family,
    detail: point.operatingPoint,
  }))
}
function EvidenceLink({ methodId, metric = 'diameter', onEvidence, children = '▾ SHOW VISUAL COMPARISON' }: { methodId?: string; metric?: EvidenceMetric; onEvidence: (methodId?: string, caseIds?: string[], metric?: EvidenceMetric) => void; children?: React.ReactNode }) {
  return <button className="evidence-link" onClick={() => onEvidence(methodId, undefined, metric)}>{children}</button>
}
function speedAccuracyRows(data: OverviewExport): TradeoffDatum[] {
  return (data.figures?.commonSpeedAccuracy ?? []).map((raw) => ({
    id: S(raw.id ?? raw.conditionId ?? raw.methodId), label: S(raw.label ?? raw.methodName),
    x: N(raw.latencyMs ?? raw.endToEndP50Ms) ?? null,
    y: N(raw.accuracyPercent ?? raw.diameterArePercent) ?? null,
    coveragePercent: N(raw.coveragePercent) ?? null,
    color: methodColor(S(raw.methodId), S(raw.family)),
    familyConnection: S(raw.family).toLowerCase() === 'segformer' ? 'segformer-family' : undefined,
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
function Overview({ data, onEvidence, go }: { data: OverviewExport; onEvidence: (methodId?: string, caseIds?: string[], metric?: EvidenceMetric) => void; go: (id: RouteId) => void }) {
  const allPoints = getFigurePoints(data)
  const [matchedCoverage, setMatchedCoverage] = useState(false)
  const [lowErrorFocus, setLowErrorFocus] = useState(false)
  const [sortByValue, setSortByValue] = useState(false)
  const [showArchitectureControls, setShowArchitectureControls] = useState(false)
  const basePoints = useOperatingPoint(allPoints, matchedCoverage)
  const points = sortByValue ? [...basePoints].sort((a, b) => a.accuracyPercent - b.accuracyPercent) : basePoints
  const accuracyRows = accuracyBarRows(points)
  const coverageRows = coverageBarRows(points)
  const speedRows = speedAccuracyRows(data).sort((a, b) => methodOrder(S(a.metadata?.methodId) || a.id, S(a.metadata?.family)) - methodOrder(S(b.metadata?.methodId) || b.id, S(b.metadata?.family)) || a.label.localeCompare(b.label))
  const speed = speedRows.filter((row) => showArchitectureControls || !/u.?net/i.test(row.label))
  const speedYDomain: [number, number] = [0, positiveCeiling(speed.map((row) => row.y))]
  const [minimumCoverage, setMinimumCoverage] = useState(() => Number(new URLSearchParams(window.location.search).get('minCoverage')) || 95)
  return <div className="route-page overview-page">
    <div className="opening"><div className="eyebrow">DEVELOPMENT BENCHMARK · EXTERNAL EVALUATION UNOPENED</div><h1>Mouse Pupillometry Benchmark</h1><p className="opening-finding">{finding(points)}</p><div className="opening-actions"><button className="text-action" onClick={() => onEvidence()}>Show same-frame visual comparison ↓</button><button className="text-action" onClick={() => go('published-method-benchmark')}>Inspect published methods →</button></div></div>
    <div className="overview-figures">
      <Figure number="1" title="Pupil diameter error" note="Corrected development validation · family-macro absolute relative error. The error is conditional on accepted frames; coverage below each method keeps that condition visible. Intervals are acquisition-family bootstrap bounds where exported.">
        <div className="bar-controls" role="group" aria-label="Diameter error chart controls"><button className={!matchedCoverage ? 'selected' : ''} onClick={() => setMatchedCoverage(false)}>Native operating point</button><button className={matchedCoverage ? 'selected' : ''} onClick={() => setMatchedCoverage(true)}>Matched 95% coverage</button><button className={sortByValue ? 'selected' : ''} onClick={() => setSortByValue((value) => !value)}>{sortByValue ? 'Restore method order' : 'Sort by value'}</button><button className={lowErrorFocus ? 'selected' : ''} onClick={() => setLowErrorFocus((value) => !value)}>{lowErrorFocus ? 'Full-scale view' : '0–25% focus'}</button></div>
        {lowErrorFocus && <p className="zoom-note">Focused 0–25% scale. Values above 25% are capped and marked ↑; labels retain their exact values. Switch to Full-scale view to see the complete range.</p>}
        <VerticalBarChart rows={accuracyRows} valueLabel="Diameter ARE (%)" domain={lowErrorFocus ? [0, 25] : [0, positiveCeiling(accuracyRows.flatMap((row) => [row.value, row.upper]), 10)]} lowerIsBetter coverageAnnotation capAbove={lowErrorFocus} onBarClick={(row) => onEvidence(row.id, undefined, 'diameter')} />
        <EvidenceLink methodId="segformer_b2" onEvidence={onEvidence} />
      </Figure>
      <Figure number="2" title="Valid-frame coverage" note="Same method order and operating points as the diameter figure above. Coverage is measured over attempted frames; the dashed line marks the 95% reference.">
        <VerticalBarChart rows={coverageRows} valueLabel="Accepted-frame coverage (%)" domain={[0, 100]} referenceLine={{ value: 95, label: '95% reference' }} lowerIsBetter={false} onBarClick={(row) => onEvidence(row.id, undefined, 'coverage')} />
        <EvidenceLink methodId="segformer_b2" metric="coverage" onEvidence={onEvidence} />
      </Figure>
      <Figure number="3" title="End-to-end median latency" note="Common A5000, batch-one benchmark only. Bars show median p50 latency. Native workflow timings stay in a separate panel on Speed & Deployment.">
        <div className="bar-controls"><label className="check-option"><input type="checkbox" checked={showArchitectureControls} onChange={(event) => setShowArchitectureControls(event.target.checked)} /> Include architecture controls</label><span>Stable method order</span></div>
        <VerticalBarChart rows={speed.map((row) => ({ id: S(row.metadata?.methodId) || row.id, label: row.label, value: row.x, color: row.color, coveragePercent: row.coveragePercent, detail: `${fmt(row.y)}% family-macro diameter ARE` }))} valueLabel="End-to-end p50 latency (ms)" domain={[0, positiveCeiling(speed.map((row) => row.x), 5)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'runtime')} />
        <EvidenceLink methodId="segformer_b2" metric="runtime" onEvidence={onEvidence} />
      </Figure>
      <details className="secondary-figure"><summary>Trade-off view · accuracy × end-to-end speed</summary><p className="figure-note">Common A5000 batch-one protocol only. The SegFormer family is connected subtly to show its operating points; no universal winner is implied.</p><div className="coverage-filter"><label htmlFor="overview-min-coverage">Minimum coverage filter</label><select id="overview-min-coverage" value={minimumCoverage} onChange={(event) => { setMinimumCoverage(Number(event.target.value)); setSharedState({ minCoverage: event.target.value }) }}>{[50, 80, 90, 95, 99].map((value) => <option key={value} value={value}>{value}%</option>)}</select></div><TradeoffScatter points={speed} xLabel="End-to-end p50 (ms)" yLabel="Family-macro diameter ARE (%)" xDirection="lower" yDirection="lower" coverageThresholdPercent={minimumCoverage} xDomain={[0, positiveCeiling(speed.map((row) => row.x))]} yDomain={speedYDomain} showFrontier onPointClick={(point) => onEvidence(S(point.metadata?.methodId) || point.id)} /></details>
    </div>
    <div className="reading-strip"><span>Development only</span><span>Biological mouse IDs unavailable in the legacy set</span><span>External and Allen evaluation unopened</span><span>Final model selection pending</span><span>B2-matched U-Net control interval crosses zero</span></div>
    <div className="next-questions"><button onClick={() => go('robustness-time')}><b>Robustness & time</b><span>Exact known reference transforms and temporal fidelity →</span></button><button onClick={() => go('segformer-deployment')}><b>SegFormer deployment</b><span>Verified common timing and backend tradeoffs →</span></button><button onClick={() => go('methods-data')}><b>Methods & data</b><span>Estimands, source rows, exports →</span></button></div>
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
function RealValidation({ summary, conditions, risk, onEvidence, go }: { summary: OverviewExport; conditions: ValidationCondition[]; risk: MetricCard[]; onEvidence: (methodId?: string, caseIds?: string[], metric?: EvidenceMetric) => void; go: (id: RouteId) => void }) {
  const [showControls, setShowControls] = useState(false)
  const [matchedCoverage, setMatchedCoverage] = useState(false)
  const points = useOperatingPoint(getFigurePoints(summary), matchedCoverage)
  const visibleConditions = showControls ? conditions : conditions.filter((row) => row.primary !== false && !/u.?net/i.test(`${S(row.family)} ${S(row.model)}`))
  const selectedRisk = card(risk, 'real-validation-risk-coverage')
  const curves: RiskCoverageSeries[] = (selectedRisk?.methods ?? []).filter((m) => (m.riskCoverage ?? []).length > 3 && /segformer|meye|pupil_dlc/i.test(m.methodId)).slice(0, 5).map((m) => ({ id: m.methodId, label: methodLabel(m), color: methodColor(m.methodId, m.family), points: (m.riskCoverage ?? []).map((p) => ({ coveragePercent: percent(p.coverage) ?? NaN, riskPercent: percent(p.risk) ?? NaN, retained: p.retained, attempted: p.attempted })).filter((p) => Number.isFinite(p.coveragePercent) && Number.isFinite(p.riskPercent)) }))
  const geometryRows: VerticalBarDatum[] = visibleConditions.flatMap((row) => { const m = row.metrics ?? {}; const value = N(m.centerErrorPx ?? m.centerMaePx); return value === undefined ? [] : [{ id: S(row.methodId) || row.conditionId, label: S(row.label) || row.conditionId, value, color: methodColor(row.methodId, row.family), family: row.family, coveragePercent: percent(row.coverage ?? row.coveragePercent) }] }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  const boundaryRows: VerticalBarDatum[] = visibleConditions.flatMap((row) => { const m = row.metrics ?? {}; const value = N(m.hd95Px ?? m.hd95 ?? m.assdPx ?? m.assd); return value === undefined ? [] : [{ id: S(row.methodId) || row.conditionId, label: S(row.label) || row.conditionId, value, color: methodColor(row.methodId, row.family), family: row.family, coveragePercent: percent(row.coverage ?? row.coveragePercent), detail: m.hd95Px !== undefined || m.hd95 !== undefined ? '95th-percentile Hausdorff distance' : 'Average symmetric surface distance' }] }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  const diceRows: VerticalBarDatum[] = visibleConditions.flatMap((row) => { const m = row.metrics ?? {}; const value = N(m.dice); return value === undefined ? [] : [{ id: S(row.methodId) || row.conditionId, label: S(row.label) || row.conditionId, value, color: methodColor(row.methodId, row.family), family: row.family, coveragePercent: percent(row.coverage ?? row.coveragePercent) }] }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  const failures: VerticalBarDatum[] = visibleConditions.flatMap((row) => {
    const m = row.metrics ?? {}
    const tail = N(m.gt20FractionRetainedPercent ?? m.catastrophicFractionPercent ?? row.gt20FractionRetainedPercent)
    return tail === undefined ? [] : [{ id: S(row.methodId) || row.conditionId, label: S(row.label) || row.conditionId, value: tail, color: methodColor(row.methodId, row.family), family: row.family, coveragePercent: percent(row.coverage ?? row.coveragePercent), detail: `${fmt(row.accepted, 0)} / ${fmt(row.attempted, 0)} accepted / attempted` }]
  }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  const diameterRows = accuracyBarRows(points)
  const selectedCoverageRows = coverageBarRows(points)
  const runtimeRows: VerticalBarDatum[] = visibleConditions.flatMap((row) => {
    const runtime = row.commonRuntime as Record<string, unknown> | undefined
    const latency = N(runtime?.latencyMs)
    return latency === undefined ? [] : [{ id: S(row.methodId) || row.conditionId, label: chartMethodLabel(S(row.methodId) || row.conditionId, S(row.label) || row.conditionId), value: latency, color: methodColor(row.methodId, row.family), family: row.family, coveragePercent: percent(row.coverage ?? row.coveragePercent), detail: S(runtime?.runtimeProtocol) || 'Verified common A5000 batch-one timing' }]
  }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  return <div className="route-page"><div className="route-heading"><div className="eyebrow">CORRECTED SHARED DEVELOPMENT POPULATION</div><h1>Published methods</h1><p>SegFormer B0, B1 and B2 are compared with established mouse-pupillometry approaches. Accuracy is conditional on accepted frames; valid-frame coverage appears in the aligned figure below.</p><p className="architecture-callout">Matched architecture control available · <button className="text-action" onClick={() => go('methods-data')}>Methods & Data →</button></p></div>
    <Section eyebrow="01 / PRIMARY RESULT" title="Measurement accuracy and coverage">
      <div className="bar-controls operating-point-switch" role="group" aria-label="Keypoint method operating point"><span>Keypoint methods:</span><button className={!matchedCoverage ? 'selected' : ''} onClick={() => setMatchedCoverage(false)}>Native operating point</button><button className={matchedCoverage ? 'selected' : ''} onClick={() => setMatchedCoverage(true)}>Matched 95% coverage</button></div>
      <Figure number="1" title={`Pupil diameter error · ${matchedCoverage ? 'matched-coverage' : 'native'} operating points`} note="Family-macro absolute relative error on accepted frames. Coverage is printed beneath each method; intervals are shown only where the family bootstrap was exported."><VerticalBarChart rows={diameterRows} valueLabel="Diameter ARE (%)" domain={[0, positiveCeiling(diameterRows.flatMap((row) => [row.value, row.upper]), 10)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'diameter')} /><EvidenceLink methodId="segformer_b2" metric="diameter" onEvidence={onEvidence} /></Figure>
      <Figure number="2" title="Valid-frame coverage · same method order" note="Coverage counts accepted frames divided by attempted frames. The 95% line is a reference, not a quality guarantee."><VerticalBarChart rows={selectedCoverageRows} valueLabel="Accepted-frame coverage (%)" domain={[0, 100]} referenceLine={{ value: 95, label: '95% reference' }} onBarClick={(row) => onEvidence(row.id, undefined, 'coverage')} /><EvidenceLink methodId="segformer_b2" metric="coverage" onEvidence={onEvidence} /></Figure>
      <div className="table-intro"><b>Measured conditions</b><button onClick={() => setShowControls((value) => !value)}>{showControls ? 'Hide' : 'Show'} architecture controls</button></div><ValidationTable conditions={visibleConditions} />
    </Section>
    <Section eyebrow="02 / FAILURE" title="Catastrophic diameter failures">{failures.length ? <Figure number="3" title="Retained frames with &gt;20% diameter error" note="This rate is conditional on retained frames. Coverage annotations show how many attempted frames each method accepted."><VerticalBarChart rows={failures} valueLabel="Retained frames with >20% error (%)" domain={[0, positiveCeiling(failures.map((row) => row.value), 10)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'diameter')} /><EvidenceLink metric="diameter" onEvidence={onEvidence} /></Figure> : <p className="scope-note">Comparable severe-error fractions are unavailable for this roster.</p>}</Section>
    <Section eyebrow="03 / MEASUREMENT" title="Measurement geometry">{geometryRows.length ? <Figure number="4" title="Center displacement on retained frames"><VerticalBarChart rows={geometryRows} valueLabel="Center error (px)" domain={[0, positiveCeiling(geometryRows.map((row) => row.value), 1)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'center')} /><EvidenceLink metric="center" onEvidence={onEvidence} /></Figure> : <p className="scope-note">Center error is listed in the technical rows where a compatible scored geometry plane exists.</p>}<p className="scope-note">Diameter is the primary measurement endpoint; area and axes remain in Methods & Data.</p></Section>
    {boundaryRows.length > 0 && <Section eyebrow="04 / BOUNDARY" title="Mask-boundary distance"><Figure number="5" title="Boundary distance on scored masks" note="The available surface-distance endpoint is preserved by source definition; the figure does not combine HD95 with ASSD."><VerticalBarChart rows={boundaryRows} valueLabel="Boundary distance (px)" domain={[0, positiveCeiling(boundaryRows.map((row) => row.value), 1)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'boundary')} /><EvidenceLink metric="boundary" onEvidence={onEvidence} /></Figure></Section>}
    <Section eyebrow="05 / MASK" title="Segmentation quality">{diceRows.length ? <Figure number="6" title="Pupil mask Dice"><VerticalBarChart rows={diceRows} valueLabel="Dice" domain={[0, 1]} coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'mask')} /><EvidenceLink metric="mask" onEvidence={onEvidence} /></Figure> : <p className="scope-note">Mask comparison appears only for methods with actual compatible scored masks. Geometry-only techniques have no invented Dice value.</p>}</Section>
    <Section eyebrow="06 / SPEED" title="Comparable end-to-end latency">{runtimeRows.length ? <Figure number="8" title="Common A5000 batch-one p50 latency" note="Only verified common-runtime methods are plotted. Native workflow timings are kept separate on SegFormer Deployment."><VerticalBarChart rows={runtimeRows} valueLabel="End-to-end p50 latency (ms)" domain={[0, positiveCeiling(runtimeRows.map((row) => row.value), 5)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'runtime')} /><EvidenceLink metric="runtime" onEvidence={onEvidence} /></Figure> : <p className="scope-note">No published-method conditions have verified common timing in this export.</p>}</Section>
    <Section eyebrow="07 / RELIABILITY" title="Selective risk"><Figure number="9" title="Risk across coverage" note="Population curves from frozen threshold rows; alternate-threshold case decisions are unavailable for some methods."><RiskCoveragePlot curves={curves} /></Figure></Section>
  </div>
}
function StressTime({ tab, setTab, exact, severity, temporal, summary, onEvidence }: {
  tab: 'spatial' | 'temporal'
  setTab: (tab: 'spatial' | 'temporal') => void
  exact: Record<string, unknown>
  severity: ExactSeverityExport
  temporal: Record<string, unknown>
  summary?: OverviewExport
  onEvidence: (methodId?: string, caseIds?: string[], metric?: EvidenceMetric) => void
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
  const seedRows = temporalRows.filter((row) => S(row.seedId) === selectedSeed && (showArchitectureControl || !/u.?net/i.test(`${S(row.methodId)} ${S(row.family)}`)))
  const points: TemporalRmseGainDatum[] = seedRows.flatMap((row) => N(row.diameterRmsePx) !== undefined && N(row.sine3HzGain) !== undefined ? [{ id: `${S(row.methodId)}-${S(row.seedId)}`, label: S(row.methodId), rmse: N(row.diameterRmsePx)!, gain: N(row.sine3HzGain)!, color: methodColor(S(row.methodId)), coveragePercent: percent(row.meanSequenceCoverage), seed: S(row.seedId) }] : [])
  const lagGain: TradeoffDatum[] = seedRows.flatMap((row) => N(row.sine3HzPhaseLagSec) !== undefined && N(row.sine3HzGain) !== undefined ? [{ id: `${S(row.methodId)}-${S(row.seedId)}`, label: S(row.methodId), x: N(row.sine3HzPhaseLagSec)! * 1000, y: N(row.sine3HzGain)!, color: methodColor(S(row.methodId)), coveragePercent: percent(row.meanSequenceCoverage), comparisonGroup: selectedSeed, metadata: { methodId: S(row.methodId), seedId: selectedSeed, coveragePercent: percent(row.meanSequenceCoverage) ?? null, scoreSha256: S(row.scoreSha256) } }] : [])
  const methodIds = severity.methodIds.filter((id) => showArchitectureControl || !id.includes('unet'))
  const methodName = (id: string) => severity.rows.find((row) => row.methodId === id)?.method ?? id
  const selectedRows = severity.rows.filter((row) => row.methodId === spatialMethod)
  const heat: TransformSeverityCell[] = selectedRows.map((row) => ({ id: row.id, transform: row.operationFamily.replaceAll('_', ' '), severity: row.severity, value: row.value, accepted: row.accepted, attempted: row.attempted, status: row.status }))
  const familyRows = severity.rows.filter((row) => row.operationFamily === selectedFamily && methodIds.includes(row.methodId))
  const availableSeverities = [...new Set(familyRows.map((row) => String(row.severity)))].sort((a, b) => Number(a) - Number(b))
  const currentSeverity = availableSeverities.includes(selectedSeverity) ? selectedSeverity : availableSeverities[0]
  const selectedSeverityRows: VerticalBarDatum[] = familyRows.filter((row) => String(row.severity) === currentSeverity && row.value !== null).map((row) => ({ id: row.methodId, label: chartMethodLabel(row.methodId, row.method), value: row.value, color: methodColor(row.methodId), coveragePercent: row.coverage * 100, detail: `${row.accepted} / ${row.attempted} accepted / attempted` })).sort((a, b) => methodOrder(a.id) - methodOrder(b.id) || a.label.localeCompare(b.label))
  const response: TransformResponseSeries[] = methodIds.map((id) => ({ id, label: methodName(id), color: methodColor(id), points: familyRows.filter((row) => row.methodId === id && N(Number(row.severity)) !== undefined).map((row) => ({ severity: Number(row.severity), value: row.value, accepted: row.accepted, attempted: row.attempted, caseId: row.caseIds[0] })) })).filter((series) => series.points.length > 1)
  const cleanByMethod = new Map((summary ? getFigurePoints(summary) : []).filter((point) => point.id.includes('__shared_scalar_mask_gt') || point.id.includes('official_mapping_fixed')).map((point) => [S(point.metadata?.methodId) || point.id.split('__')[0], point]))
  const robustness: TradeoffDatum[] = familyRows.filter((row) => String(row.severity) === currentSeverity).flatMap((row) => {
    const clean = cleanByMethod.get(row.methodId)
    return clean && row.value !== null ? [{ id: row.id, label: row.method, x: clean.accuracyPercent, y: row.value, color: methodColor(row.methodId), coveragePercent: row.coverage * 100, comparisonGroup: `${selectedFamily}:${currentSeverity}`, metadata: { methodId: row.methodId, realCoveragePercent: clean.coveragePercent, exactRetained: row.accepted, exactAttempted: row.attempted, source: row.sourceRefs[0]?.path } }] : []
  })
  const selectedRowForCell = (cell: TransformSeverityCell) => selectedRows.find((row) => row.id === cell.id)
  return <div className="route-page">
    <div className="route-heading"><div className="eyebrow">FROZEN EXACT KNOWN REFERENCE DEVELOPMENT PROTOCOLS</div><h1>Robustness & time</h1><p>Spatial perturbations and temporal trajectories are separate controlled tests.</p><div className="subtabs"><button className={tab === 'spatial' ? 'selected' : ''} onClick={() => setTab('spatial')}>V2.1 spatial</button><button className={tab === 'temporal' ? 'selected' : ''} onClick={() => setTab('temporal')}>V2.2 temporal</button></div></div>
    {tab === 'spatial' ? <>
      <Section eyebrow={`EXACT KNOWN REFERENCE V2.1 · ${severity.caseCount} IDENTICAL FROZEN CASES`} title="Transform response" lead="Each value is mean diameter ARE on accepted frames within one source-defined operation and severity cell. Coverage and counts remain attached; no interval is invented.">
        <div className="coverage-filter"><label htmlFor="spatial-method">Method</label><select id="spatial-method" value={spatialMethod} onChange={(event) => { setSpatialMethod(event.target.value); setSharedState({ spatialMethod: event.target.value }) }}>{methodIds.map((id) => <option key={id} value={id}>{methodName(id)}</option>)}</select><label className="check-option"><input type="checkbox" checked={showArchitectureControl} onChange={(event) => setShowArchitectureControl(event.target.checked)} /> Show architecture control</label></div>
        {selectedSeverityRows.length > 0 && <Figure number="7A" title={`Diameter error · ${selectedFamily.replaceAll('_', ' ')} · ${currentSeverity}`} note="Selected source-defined severity, across measured methods. Values are conditional on accepted frames; coverage is shown under each bar."><VerticalBarChart rows={selectedSeverityRows} valueLabel="Diameter ARE (%)" domain={[0, positiveCeiling(selectedSeverityRows.map((row) => row.value), 10)]} lowerIsBetter coverageAnnotation onBarClick={(row) => onEvidence(row.id, undefined, 'diameter')} /><EvidenceLink methodId="segformer_b2" metric="diameter" onEvidence={onEvidence} /></Figure>}
        <Figure number="7" title="Operation family × source severity" note="Blur levels are kernel length in pixels; occlusion and crop levels are visible fractions; combined pupil is one categorical condition. Blank cells mean that operation has no such source level. Click a measured cell for an indexed matching case."><TransformSeverityHeatmap rows={heat} metricLabel="Diameter ARE (%)" onCellSelect={(cell) => { const row = selectedRowForCell(cell); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure>
        <p className="scope-note">The frozen corpus contains blur, latent occlusion, crop/truncation, and a combined pupil-local transform. Standalone noise, glare, ROI-shift, translation and scale sweeps are not present and are not inferred.</p>
      </Section>
      <Section eyebrow="SEVERITY RESPONSE" title="How error changes with perturbation">
        <div className="coverage-filter"><label htmlFor="spatial-family">Operation family</label><select id="spatial-family" value={selectedFamily} onChange={(event) => { setSelectedFamily(event.target.value); setSelectedSeverity(''); setSharedState({ transform: event.target.value, severity: undefined }) }}>{severity.operationFamilies.map((family) => <option key={family} value={family}>{family.replaceAll('_', ' ')}</option>)}</select><label htmlFor="spatial-severity">Severity</label><select id="spatial-severity" value={currentSeverity} onChange={(event) => { setSelectedSeverity(event.target.value); setSharedState({ severity: event.target.value }) }}>{availableSeverities.map((level) => <option key={level} value={level}>{level} {selectedFamily === 'motion_blur' ? 'px kernel' : selectedFamily === 'combined_pupil' ? 'compound' : 'visible fraction'}</option>)}</select></div>
        {response.length ? <Figure number="8" title="Source-defined response curve" note="Methods share the frozen execution rows within this family. The line connects only source-defined numeric levels; the compound transform has no invented ordinal curve."><TransformResponseCurve series={response} xLabel={selectedFamily === 'motion_blur' ? 'Blur kernel length (px)' : 'Target visible fraction'} yLabel="Diameter ARE (%)" yDomain={[0, positiveCeiling(response.flatMap((series) => series.points.map((point) => point.value)))]} onPointSelect={(point, series) => { const row = familyRows.find((item) => item.methodId === series.id && Number(item.severity) === point.severity); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure> : <p className="scope-note">This source-defined condition has one categorical level; no response curve is drawn.</p>}
        {robustness.length > 1 && <Figure number="9" title="Human-reference error × selected perturbation error" note="The axes come from distinct frozen development protocols. Each mark combines the same method's conditional diameter ARE with its selected perturbation cell; coverage differs by protocol."><TradeoffScatter points={robustness} xLabel="Human-reference diameter ARE (%)" yLabel="Exact-reference diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(robustness.map((row) => row.x))]} yDomain={[0, positiveCeiling(robustness.map((row) => row.y))]} showFrontier onPointClick={(point) => { const row = familyRows.find((item) => item.id === point.id); if (row) onEvidence(row.methodId, row.caseIds) }} /></Figure>}
      </Section>
      <Section title="How the exact known reference is defined"><div className="semantic-grid"><p><b>Nuisance transforms.</b> The reference remains unchanged when only image appearance changes.</p><p><b>Geometric transforms.</b> Image and reference transform together.</p><p><b>Occlusion.</b> Latent full-pupil reference or visible reference is specified by the source condition.</p><p><b>Crop and truncation.</b> Interpret valid extent and acceptance with the exported condition.</p></div></Section>
      <details><summary>Pooled spatial summaries</summary><div className="compact-metrics">{exactCards.filter((c) => /-mean$|-coverage$/.test(c.id)).map((c) => <div key={c.id}><b>{c.title}</b><span>{valueMethods(c).length} measured conditions</span></div>)}</div></details>
    </> : <>
      <Section eyebrow="EXACT KNOWN REFERENCE V2.2 · PREDICTION-BLIND SEEDS · 18 TRAJECTORIES PER SEED · 96 FRAMES PER TRAJECTORY" title="No conjunctive temporal-fidelity winner established" lead="Error, 3-Hz response, phase and coverage must be read together for a selected prediction-blind seed."><div className="coverage-filter"><label htmlFor="temporal-seed">Seed</label><select id="temporal-seed" value={selectedSeed} onChange={(event) => { setSelectedSeed(event.target.value); setSharedState({ seed: event.target.value }) }}>{seeds.map((seed) => <option key={seed} value={seed}>{seed}</option>)}</select><label className="check-option"><input type="checkbox" checked={showArchitectureControl} onChange={(event) => setShowArchitectureControl(event.target.checked)} /> Include architecture controls</label></div><div className="figure-pair"><Figure number="10" title="RMSE versus 3-Hz gain" note="Gain target is 1. Low RMSE can coincide with response attenuation; each mark is a method on the selected seed."><TemporalRmseGainScatter points={points} /></Figure><Figure number="11" title="Phase lag versus 3-Hz gain" note="Ideal response is lag 0 ms and gain 1. The observed frontier is within the selected seed only."><TradeoffScatter points={lagGain} xLabel="3-Hz phase lag (ms)" yLabel="3-Hz gain" xDirection="target" xTarget={0} yDirection="target" yTarget={1} showFrontier onPointClick={(point) => onEvidence(S(point.metadata?.methodId), undefined, 'temporal')} /></Figure></div><button className="evidence-link" onClick={() => onEvidence(undefined, undefined, 'temporal')}>▾ Show synchronized source and traces</button></Section><Section title="Frequency and event response"><p className="scope-note">The current public score export supports the measured 3-Hz gain and phase observations above. Multi-frequency transfer curves and synchronized event traces are unavailable in this export.</p></Section>
    </>}
  </div>
}
function SpeedDeployment({ runtime, deployment, nativeCpu, onEvidence }: { runtime: MetricCard[]; deployment: MetricCard[]; nativeCpu: NativeCpuRuntimeExport; onEvidence: (methodId?: string, caseIds?: string[], metric?: EvidenceMetric) => void }) {
  const [minimumCoverage, setMinimumCoverage] = useState(() => Number(new URLSearchParams(window.location.search).get('minCoverage')) || 95)
  const [fidelityMetricId, setFidelityMetricId] = useState('deployment-diameter_delta_abs_px_median_vs_fp32')
  const p50 = card(runtime, 'runtime-common-end_to_end_p50_ms')
  const p95 = card(runtime, 'runtime-common-end_to_end_p95_ms')
  const commonRows: VerticalBarDatum[] = valueMethods(p50).map((m) => {
    const median = N(m.value) ?? null
    const upper = N(p95?.methods?.find((entry) => entry.methodId === m.methodId)?.value) ?? null
    return { id: m.methodId, label: chartMethodLabel(m.methodId, methodLabel(m)), value: median, lower: median, upper, color: methodColor(m.methodId, m.family), family: m.family, detail: `p95 ${fmt(upper)} ms · ${m.runtimeProtocol ?? 'common A5000 batch one'}` }
  }).sort((a, b) => methodOrder(a.id, a.family) - methodOrder(b.id, b.family) || a.label.localeCompare(b.label))
  const nativeRows: VerticalBarDatum[] = nativeCpu.conditions.map((condition) => ({
    id: condition.conditionId,
    label: chartMethodLabel(condition.methodId ?? condition.conditionId, condition.method),
    value: condition.endToEndP50Ms,
    lower: condition.endToEndP50Ms,
    upper: condition.endToEndP95Ms,
    color: methodColor(condition.methodId ?? condition.conditionId),
    detail: `${condition.nativeParityMode.replaceAll('_', ' ').toLowerCase()}; initialization ${fmt(condition.initializationMs)} ms; p95 ${fmt(condition.endToEndP95Ms)} ms`,
  })).sort((a, b) => methodOrder(a.id) - methodOrder(b.id) || a.label.localeCompare(b.label))

  const deployed: Record<string, DeploymentMatrixRow> = {}
  const keys = [['deployment-pure_model_latency_p50_ms', 'modelOnlyP50Ms'], ['deployment-end_to_end_latency_p50_ms', 'endToEndP50Ms'], ['deployment-coverage', 'coveragePercent'], ['deployment-acquisition_family_macro_diameter_ARE', 'diameterArePercent']] as const
  keys.forEach(([id, key]) => card(deployment, id)?.methods?.forEach((m) => {
    const status = m.status ?? ''
    const cohort = S(m.comparisonCohort) || (/INT8/i.test(S(m.precision)) ? 'legacy-int8-1130' : 'corrected-1337')
    const isInt8Extension = m.int8Extension === true || cohort === 'legacy-int8-1130' || /INT8/i.test(S(m.precision))
    const cohortLabel = isInt8Extension ? 'Legacy INT8 extension · 1,130 rows' : 'Corrected validation · 1,337 rows'
    const row = deployed[m.methodId] ?? {
      id: m.methodId, model: m.architecture ?? m.variant ?? m.methodId,
      backend: m.backend ?? '', precision: m.precision ?? '', comparisonCohort: cohort, cohortLabel,
      int8Extension: isInt8Extension,
      gateStatus: /FAIL COVERAGE|MEASURED_FAIL_95PCT/.test(status) ? 'executed-failed' as const : /FAIL/.test(status) ? 'fail' as const : /PASS/.test(status) ? 'pass' as const : 'unknown' as const,
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
    row.accuracyDeltaPp = row.int8Extension || row.diameterArePercent === null || row.diameterArePercent === undefined || baseline?.diameterArePercent === null || baseline?.diameterArePercent === undefined
      ? null : row.diameterArePercent - baseline.diameterArePercent
  })
  const backendRank = (value: string) => ({ pytorch: 0, inductor: 1, tensorrt: 2 }[value.toLowerCase()] ?? 9)
  const precisionRank = (value: string) => ({ fp32: 0, bf16: 1, fp16: 2, int8: 3 }[value.toLowerCase()] ?? 9)
  const modelRank = (value: string) => /b0/i.test(value) ? 0 : /b1/i.test(value) ? 1 : /b2/i.test(value) ? 2 : 9
  const variants = Object.values(deployed).sort((a, b) => modelRank(a.model) - modelRank(b.model) || backendRank(a.backend) - backendRank(b.backend) || precisionRank(a.precision) - precisionRank(b.precision))
  const correctedVariants = variants.filter((row) => row.comparisonCohort === 'corrected-1337' && !row.int8Extension)
  const int8Variants = variants.filter((row) => row.int8Extension || /INT8/i.test(row.precision) || row.comparisonCohort === 'legacy-int8-1130')
  const modelColors: Record<string, string> = { B0: METHOD_PALETTE.segformerB0, B1: METHOD_PALETTE.segformerB1, B2: METHOD_PALETTE.segformerB2 }
  const makeFrontier = (source: DeploymentMatrixRow[]): DeploymentFrontierDatum[] => source.map((row) => ({
    id: row.id, label: `${row.model} · ${row.backend} ${row.precision}`,
    latencyMs: row.endToEndP50Ms ?? null, diameterArePercent: row.diameterArePercent ?? null,
    coveragePercent: row.coveragePercent ?? null, color: modelColors[row.model] ?? methodColor(row.id),
    status: row.gateLabel,
    metadata: { model: row.model, backend: row.backend, precision: row.precision,
      modelOnlyP50Ms: row.modelOnlyP50Ms ?? null, endToEndP50Ms: row.endToEndP50Ms ?? null,
      coveragePercent: row.coveragePercent ?? null, diameterArePercent: row.diameterArePercent ?? null,
      comparisonCohort: row.comparisonCohort ?? '', cohortLabel: row.cohortLabel ?? '', qualification: row.gateLabel },
  }))
  const correctedFrontier = makeFrontier(correctedVariants)
  const int8Frontier = makeFrontier(int8Variants)
  const resourcePoints = (field: 'modelSizeMb' | 'vramMb'): TradeoffDatum[] => correctedVariants.filter((row) => N(row[field]) !== undefined && N(row.diameterArePercent) !== undefined).map((row) => ({ id: row.id, label: `${row.model} · ${row.backend} ${row.precision}`, x: row[field] ?? null, y: row.diameterArePercent ?? null, coveragePercent: row.coveragePercent ?? null, color: modelColors[row.model] ?? methodColor(row.id), status: row.gateLabel, comparisonGroup: 'corrected-1337', metadata: { model: row.model, backend: row.backend, precision: row.precision, qualification: row.gateLabel, comparisonCohort: row.comparisonCohort ?? '' } }))
  const fidelitySpecs = [
    ['deployment-diameter_delta_abs_px_median_vs_fp32', 'Median absolute diameter change vs FP32', 'Median absolute diameter change (px)', 5],
    ['deployment-changed_retention_count_vs_fp32', 'Changed retention decisions vs FP32', 'Changed retention decisions (frames)', 0],
    ['deployment-pupil_mask_disagreement_percent_median_vs_fp32', 'Median pupil-mask disagreement vs FP32', 'Median pupil-mask disagreement (%)', 4],
  ] as const
  const activeFidelity = fidelitySpecs.find(([id]) => id === fidelityMetricId) ?? fidelitySpecs[0]
  const fidelityCard = card(deployment, activeFidelity[0])
  const fidelityRows: VerticalBarDatum[] = valueMethods(fidelityCard).filter((m) => (S(m.comparisonCohort) || 'corrected-1337') === 'corrected-1337' && !m.int8Extension && !/INT8/i.test(S(m.precision))).map((m) => ({
    id: m.methodId,
    label: `${m.architecture ?? m.variant ?? 'SegFormer'} · ${m.backend ?? ''} ${m.precision ?? ''}`,
    value: N(m.value) ?? null,
    color: modelColors[S(m.architecture)] ?? methodColor(m.methodId, m.family),
    family: m.family,
    detail: `${S(m.status) || 'Measured against same-checkpoint PyTorch FP32'} · corrected validation, 1,337 frames`,
  })).sort((a, b) => modelRank(a.label) - modelRank(b.label) || backendRank(a.label.split(' · ')[1] ?? '') - backendRank(b.label.split(' · ')[1] ?? '') || precisionRank(a.label.split(' ').at(-1) ?? '') - precisionRank(b.label.split(' ').at(-1) ?? ''))
  const fidelityDomain: [number, number] = [0, positiveCeiling(fidelityRows.map((row) => row.value), activeFidelity[3] === 5 ? 0.001 : activeFidelity[3] === 4 ? 0.001 : 1)]
  const accuracyDomain: [number, number] = [0, positiveCeiling(correctedFrontier.map((point) => point.diameterArePercent ?? null), 5)]
  const makeRuntimeRows = (source: VerticalBarDatum[]) => source.map((row) => ({ ...row, lower: row.value, upper: row.upper ?? row.value }))

  return <div className="route-page">
    <div className="route-heading"><div className="eyebrow">MEASURED BACKEND × PRECISION CONDITIONS</div><h1>SegFormer deployment frontier</h1><p>B0, B1 and B2 provide distinct practical operating points. The 27 corrected-validation conditions and the three-row INT8 extension are shown in separate comparisons.</p></div>
    <Section eyebrow="01 / CORRECTED VALIDATION · 1,337 FRAMES" title="Deployment accuracy × end-to-end latency" lead="PyTorch, Inductor and TensorRT FP32/BF16/FP16 variants only. Red rings mark conditions that fail the frozen 95% coverage gate; exact values remain in the full table.">
      <div className="coverage-filter"><label htmlFor="deployment-min-coverage">Minimum coverage filter</label><select id="deployment-min-coverage" value={minimumCoverage} onChange={(event) => { setMinimumCoverage(Number(event.target.value)); setSharedState({ minCoverage: event.target.value }) }}>{[50,80,90,95,99].map((value) => <option key={value} value={value}>{value}%</option>)}</select></div>
      <div className="figure-pair">
        <Figure number="D1" title="Diameter error × end-to-end latency" note="Lower-left is preferable. Backend changes the marker; model family retains its blue hue. Accuracy is conditional on accepted frames; the aligned coverage panel shows each acceptance rate."><DeploymentFrontierScatter points={correctedFrontier} view="latency-accuracy" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id, undefined, 'diameter')} /><EvidenceLink methodId="segformer_b2__pytorch_fp32" metric="diameter" onEvidence={onEvidence} /></Figure>
        <Figure number="D2" title="Coverage × end-to-end latency" note="Dashed line marks the frozen 95% reference. B1 and B2 PyTorch FP32 fall just below this gate in the corrected cohort."><DeploymentFrontierScatter points={correctedFrontier} view="latency-coverage" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id, undefined, 'coverage')} /><EvidenceLink methodId="segformer_b2__pytorch_fp32" metric="coverage" onEvidence={onEvidence} /></Figure>
      </div>
    </Section>
    <Section eyebrow="02 / EXECUTED LEGACY EXTENSION · 1,130 FRAMES" title="INT8 deployment results" lead="INT8 executed for B0, B1 and B2, but uses the legacy validation rows and a different checkpoint. These three points are not part of the corrected-cohort 27-point frontier; coverage is evaluated within this extension.">
      {int8Frontier.length ? <div className="figure-pair">
        <Figure number="D3" title="INT8 diameter error × end-to-end latency"><DeploymentFrontierScatter points={int8Frontier} view="latency-accuracy" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id, undefined, 'diameter')} /><EvidenceLink methodId={int8Frontier[0]?.id} metric="diameter" onEvidence={onEvidence} /></Figure>
        <Figure number="D4" title="INT8 coverage × end-to-end latency" note="The 95% gate applies to the 1,130-frame extension cohort only."><DeploymentFrontierScatter points={int8Frontier} view="latency-coverage" coverageThresholdPercent={minimumCoverage} onPointClick={(point) => onEvidence(point.id, undefined, 'coverage')} /></Figure>
      </div> : <p className="scope-note">No INT8 extension records are available in the current export.</p>}
    </Section>
    <Section eyebrow="03 / VERIFIED COMMON PROTOCOL" title="Common A5000 end-to-end speed" lead="Comparable method set · batch one. Standard DLC uses the measured adapter for timing while retaining its native operating-point coverage. End-to-end latency includes the measurement pipeline; model-only values remain separate in deployment detail.">
      <Figure number="D5" title="End-to-end median latency" note="Bars show p50. Whiskers extend from p50 to p95 measured-call quantiles; this span is not a confidence interval."><VerticalBarChart rows={makeRuntimeRows(commonRows)} valueLabel="End-to-end p50 latency (ms)" domain={[0, positiveCeiling(commonRows.flatMap((row) => [row.value, row.upper]), 5)]} lowerIsBetter intervalLabel="p50–p95 measured quantile span, not a confidence interval" onBarClick={(row) => onEvidence(row.id, undefined, 'runtime')} /><EvidenceLink methodId="segformer_b2" metric="runtime" onEvidence={onEvidence} /></Figure>
    </Section>
    <Section eyebrow="04 / SEPARATE NATIVE WORKFLOW" title="Native CPU runtime" lead={`Eight measured methods on ${nativeCpu.hardware.machine} CPU, using a frozen ${nativeCpu.sharedStreamSamples}-sample stream, batch one. This protocol is separate from the common CUDA A5000 benchmark.`}>
      <Figure number="D6" title="Native CPU end-to-end median latency" note="Bars show p50; whiskers show p50–p95 timed-call quantiles, not a biological confidence interval. Initialization and parity details remain method-specific."><VerticalBarChart rows={makeRuntimeRows(nativeRows)} valueLabel="Native CPU p50 latency (ms)" domain={[0, positiveCeiling(nativeRows.flatMap((row) => [row.value, row.upper]), 5)]} lowerIsBetter intervalLabel="p50–p95 measured quantile span, not a confidence interval" onBarClick={(row) => onEvidence(row.id, undefined, 'runtime')} /><EvidenceLink metric="runtime" onEvidence={onEvidence} /></Figure>
      <details><summary>Methods without verified native CPU timing</summary><p className="scope-note">N/A in this native population: {nativeCpu.excludedMethods.map((method) => method.methodId.replaceAll('_', ' ')).join(', ')}. These methods have no assigned synthetic times.</p></details>
    </Section>
    <Section eyebrow="05 / SCIENTIFIC OUTPUT FIDELITY" title="Output changes versus same-checkpoint PyTorch FP32" lead="These parity summaries compare the same 1,337 validation frames and checkpoint. They show measured output changes; lower precision is not assumed to be worse.">
      <div className="coverage-filter"><label htmlFor="deployment-fidelity-metric">Output difference</label><select id="deployment-fidelity-metric" value={fidelityMetricId} onChange={(event) => setFidelityMetricId(event.target.value)}>{fidelitySpecs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
      {fidelityRows.length ? <Figure number="D7" title={activeFidelity[1]} note="All 27 corrected-cohort conditions are represented when measured. INT8 is not included because its validation population and checkpoint differ."><VerticalBarChart rows={fidelityRows} valueLabel={activeFidelity[2]} domain={fidelityDomain} lowerIsBetter valueDigits={activeFidelity[3]} /><EvidenceLink methodId="segformer_b2__pytorch_fp32" metric={fidelityMetricId.includes('mask') ? 'mask' : fidelityMetricId.includes('changed_retention') ? 'coverage' : 'diameter'} onEvidence={onEvidence} /></Figure> : <p className="scope-note">No corrected-cohort output-parity values are available for this metric.</p>}
    </Section>
    <Section eyebrow="06 / COMPLETE MEASUREMENTS" title="Backend and precision detail"><p className="section-lead">All {variants.length} deployment conditions stay accessible. The table labels the 27 corrected-validation rows separately from the three executed INT8 extension rows. Model-only and end-to-end p50 are distinct quantities. ARE difference is calculated between aggregate conditional estimates, whose accepted-frame sets may differ.</p><DeploymentMatrix rows={variants} /><details><summary>Resource tradeoffs within the corrected 1,337-frame cohort</summary><div className="figure-pair"><Figure number="D8" title="Stored model size × diameter error" note="Engine bytes where exported; otherwise training-checkpoint bytes. Storage definitions are identified in the table."><TradeoffScatter points={resourcePoints('modelSizeMb')} xLabel="Engine or checkpoint size (MB)" yLabel="Diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(resourcePoints('modelSizeMb').map((point) => point.x))]} yDomain={accuracyDomain} coverageThresholdPercent={95} onPointClick={(point) => onEvidence(point.id, undefined, 'diameter')} /></Figure><Figure number="D9" title="Peak allocated VRAM × diameter error" note="Only conditions with recorded PyTorch allocated VRAM are plotted."><TradeoffScatter points={resourcePoints('vramMb')} xLabel="Peak PyTorch allocated VRAM (MB)" yLabel="Diameter ARE (%)" xDirection="lower" yDirection="lower" xDomain={[0, positiveCeiling(resourcePoints('vramMb').map((point) => point.x), 100)]} yDomain={accuracyDomain} coverageThresholdPercent={95} onPointClick={(point) => onEvidence(point.id, undefined, 'diameter')} /></Figure></div></details></Section>
  </div>
}
function ArchitectureTrainingProtocol() {
  return <details className="architecture-protocol"><summary>Matched training and selection protocol</summary>
    <p>The architecture control uses the same frozen 4,176-row training split and 1,337-row, seven-family development validation split as SegFormer B2. U-Net small, base and B2-matched used seed 23, a 150-epoch budget, effective batch 8, the same two-channel pupil/visible-eye target, equal-channel BCE plus soft-Dice loss, raw mask threshold 0.5 and no morphology. The B2-matched U-Net used physical batch 2 with four-step gradient accumulation.</p>
    <p>Training used AdamW (learning rate 6×10⁻⁵, weight decay 0.01, β₁ 0.9, β₂ 0.999), gradient clipping at 1, five-percent linear warmup and linear polynomial decay to zero. Shared train-only augmentation used horizontal flips, modest affine transforms, brightness/contrast changes, Gaussian noise and blur. Validation and checkpointing ran every five epochs.</p>
    <p>Selected checkpoints minimized seven-family macro diameter error among validation-only operating points with at least 95% coverage and all seven families retained. Ties favored higher coverage then lower threshold. The intervals below resample acquisition families, not training seeds. Selected epochs, parameter counts, checkpoint hashes and exact source hashes are recorded in the <a href={`${import.meta.env.BASE_URL}data/segmentation.json`} download>architecture-control export</a>; the public result remains development-only.</p>
  </details>
}
function MethodsData({ manifest, summary, validation, showExplorer, setShowExplorer, fullData }: { manifest: Record<string, unknown>; summary?: OverviewExport; validation?: ValidationExport; showExplorer: boolean; setShowExplorer: (value: boolean) => void; fullData?: BenchmarkData }) {
  const files = (manifest.files ?? {}) as Record<string, { sha256?: string; sizeBytes?: number }>
  const [technicalCategory, setTechnicalCategory] = useState<string>('real_validation')
  return <div className="route-page"><div className="route-heading"><div className="eyebrow">DEFINITIONS · PROVENANCE · DOWNLOADS</div><h1>Methods & data</h1><p>Scientific condition identity, estimands and exact export sources.</p></div><Section title="Reading the benchmark"><div className="semantic-grid"><p><b>Population.</b> Corrected shared development validation population, grouped by acquisition family. Biological mouse IDs are unavailable in the legacy set.</p><p><b>Estimand.</b> Family-macro diameter ARE is conditional on accepted frames. Coverage uses attempted frames.</p><p><b>Uncertainty.</b> Bootstrap intervals resample acquisition families. They do not include training-seed variation.</p><p><b>Condition identity.</b> Family → model → representation → operating point → backend → precision. Deployment variants remain nested under their scientific model.</p></div></Section><Section title="Export identity"><dl className="export-identity"><div><dt>Status</dt><dd>{S(manifest.status) || 'Development'}</dd></div><div><dt>External evaluation</dt><dd>{S(manifest.externalEvaluation) || 'Not opened'}</dd></div><div><dt>Version</dt><dd>{S(manifest.version)}</dd></div><div><dt>Source fingerprint</dt><dd><code>{S(manifest.sourceFingerprintSha256)}</code></dd></div></dl><details><summary>File hashes and sizes</summary><div className="hash-table">{Object.entries(files).map(([name, meta]) => <div key={name}><a href={`${import.meta.env.BASE_URL}data/${name}`} download>{name}</a><code>{meta.sha256 ?? 'N/A'}</code><span>{fmt(meta.sizeBytes, 0)} bytes</span></div>)}</div></details></Section><Section title="Architecture controls" lead="Matched U-Net small, base and B2-scale conditions test whether an ordinary convolutional model performs similarly under the same training regime. The paired seven-family interval crosses zero for the matched B2-scale comparison; this control does not support intrinsic architecture superiority."><ArchitectureTrainingProtocol />{summary && <Figure number="S1" title="Paired U-Net − SegFormer B2 difference" note="Acquisition-family bootstrap interval; training-seed variability is not represented."><PairedDifferenceForest rows={getPaired(summary)} /></Figure>}{validation && <ValidationTable conditions={validation.conditions.filter((row) => /u.?net/i.test(S(row.family)) || /segformer.*b2/i.test(`${S(row.family)} ${S(row.model)}`))} />}</Section><Section title="Full technical explorer"><p>Complete exported metrics and capability definitions are available for forensic review.</p><button className="evidence-link" onClick={() => setShowExplorer(!showExplorer)}>{showExplorer ? 'Hide' : 'Open'} full technical explorer</button>{showExplorer && !fullData && <Loading label="technical explorer" />}{showExplorer && fullData && <div className="technical-explorer"><div className="explorer-tabs">{Object.entries(fullData.cardsByCategory).filter(([key]) => key !== 'capabilities').map(([key, cards]) => <button key={key} className={technicalCategory === key ? 'selected' : ''} onClick={() => setTechnicalCategory(key)}>{key.replaceAll('_', ' ')} · {cards.length}</button>)}<button className={technicalCategory === 'capabilities' ? 'selected' : ''} onClick={() => setTechnicalCategory('capabilities')}>Capabilities · {fullData.capabilityMatrix.length}</button></div>{technicalCategory === 'capabilities' ? <CapabilityMatrix definitions={fullData.capabilityMatrix} identities={fullData.methods} query="" /> : fullData.cardsByCategory[technicalCategory as keyof typeof fullData.cardsByCategory]?.map((c) => <MetricCardView key={c.id} card={c} data={fullData} identities={fullData.methods} flags={{ representations: false, deployments: false }} />)}</div>}</Section><Section title="Downloads"><div className="download-links"><a href={`${import.meta.env.BASE_URL}data/benchmark_manifest.json`} download>Benchmark manifest ↗</a><a href={`${import.meta.env.BASE_URL}data/real_validation_v2.json`} download>Unified real-validation rows ↗</a><a href={`${import.meta.env.BASE_URL}data/provenance.json`} download>Full provenance ↗</a></div></Section></div>
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
  const evidenceDialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [evidenceMethodId, setEvidenceMethodId] = useState<string | undefined>(new URLSearchParams(window.location.search).get('compare')?.split(',')[0] || undefined)
  const requestedMetric = new URLSearchParams(window.location.search).get('metric') as EvidenceMetric | null
  const validMetrics: EvidenceMetric[] = ['diameter', 'center', 'area', 'mask', 'boundary', 'coverage', 'runtime', 'temporal']
  const [evidenceMetric, setEvidenceMetric] = useState<EvidenceMetric>(requestedMetric && validMetrics.includes(requestedMetric) ? requestedMetric : 'diameter')
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
    const dialog = evidenceDialogRef.current
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const getFocusable = () => [...(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])].filter((element) => element.offsetParent !== null)
    const closeOnEscapeAndTrapTab = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setEvidenceOpen(false)
        setSharedState({ evidence: undefined })
      } else if (event.key === 'Tab') {
        const focusable = getFocusable()
        if (!focusable.length) { event.preventDefault(); dialog?.focus(); return }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
    }
    const firstFocus = dialog?.querySelector<HTMLElement>('[data-modal-close]') ?? dialog
    firstFocus?.focus()
    window.addEventListener('keydown', closeOnEscapeAndTrapTab)
    return () => window.removeEventListener('keydown', closeOnEscapeAndTrapTab)
  }, [evidenceOpen])
  useEffect(() => {
    if (evidenceOpen || !previousFocusRef.current) return
    previousFocusRef.current.focus()
    previousFocusRef.current = null
  }, [evidenceOpen])
  const go = (id: RouteId) => { if (route !== id) { window.location.hash = id; setRoute(id) } window.scrollTo({ top: 0, behavior: 'instant' }) }
  const openEvidence = (methodId?: string, caseIds: string[] = [], metric: EvidenceMetric = 'diameter') => { if (document.activeElement instanceof HTMLElement) previousFocusRef.current = document.activeElement; const a = methodId || 'segformer_b2'; const b = a === 'segformer_b2' ? 'meye_released' : 'segformer_b2'; setEvidenceMethodId(a); setEvidenceComparatorId(b); setEvidenceMetric(metric); setPreferredCaseIds(caseIds); setVisualCases(undefined); setEvidenceOpen(true); setSharedState({ evidence: '1', metric, compare: `${a},${b}`, case: caseIds.length ? undefined : new URLSearchParams(window.location.search).get('case') ?? undefined }) }
  const selectCase = (id: string) => {
    const selected = caseIndex?.find((item) => item.id === id)
    if (!selected) return
    setSelectedCaseId(id)
    setSharedState({ case: id })
    setVisualCases(undefined)
    getCase(selected).then((item) => setVisualCases([item])).catch(setError)
  }
  const evidenceCard = useMemo(() => ({ id: route === 'robustness-time' ? stressTab === 'spatial' ? 'exact-gt-diameter_are-mean' : 'temporal-sine3HzGain' : route === 'segformer-deployment' ? 'deployment-accuracy-coverage' : `real-validation-${evidenceMetric}`, title: route === 'robustness-time' ? 'Exact known reference visual evidence' : route === 'segformer-deployment' ? 'Selected deployment condition' : `${evidenceMetric[0].toUpperCase()}${evidenceMetric.slice(1)} evidence`, category: route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation', overlayType: route === 'robustness-time' && stressTab === 'temporal' ? 'temporal' : evidenceMetric }) as MetricCard, [route, stressTab, evidenceMetric])
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
  return <div className="redesign-shell"><header className="redesign-header"><div className="header-inner"><a href="#overview" className="brand" onClick={(e) => { e.preventDefault(); go('overview') }}><span className="brand-mark">◉</span><span>Mouse Pupillometry<br /><b>Benchmark</b></span></a><div className="header-status"><b>Development benchmark</b><span>{fmt(overview?.population?.acquisitionFamilyCount, 0)} acquisition families · {fmt(overview?.population?.validationFrameCount, 0)} validation frames</span><span>External evaluation unopened · final model selection pending</span></div></div><nav className="redesign-nav" aria-label="Primary destinations">{NAV.map((item) => <button key={item.id} aria-current={route === item.id ? 'page' : undefined} className={route === item.id ? 'active' : ''} onClick={() => go(item.id)}>{item.label}</button>)}</nav></header><main id="main-content">{Boolean(error) && <ErrorState error={error} />}{route === 'overview' && (overview ? <Overview data={overview} onEvidence={openEvidence} go={go} /> : <Loading label="overview" />)}{route === 'published-method-benchmark' && (overview && validation && risk ? <RealValidation summary={overview} conditions={validation.conditions} risk={risk} onEvidence={openEvidence} go={go} /> : <Loading label="real validation" />)}{route === 'robustness-time' && (exact && exactSeverity && temporal ? <StressTime tab={stressTab} setTab={(tab) => { setStressTab(tab); setSharedState({ view: tab }) }} exact={exact} severity={exactSeverity} temporal={temporal} summary={overview} onEvidence={openEvidence} /> : <Loading label="stress and temporal data" />)}{route === 'segformer-deployment' && (runtime && deployment && nativeCpu ? <SpeedDeployment runtime={runtime} deployment={deployment} nativeCpu={nativeCpu} onEvidence={openEvidence} /> : <Loading label="deployment data" />)}{route === 'methods-data' && (manifest ? <MethodsData manifest={manifest} summary={overview} validation={validation} showExplorer={showExplorer} setShowExplorer={setShowExplorer} fullData={fullData} /> : <Loading label="Methods & data" />)}{evidenceOpen && <div className="evidence-modal-backdrop" role="presentation" onClick={() => { setEvidenceOpen(false); setSharedState({ evidence: undefined }) }}><div ref={evidenceDialogRef} className="evidence-modal" role="dialog" aria-modal="true" aria-label="Visual comparison" tabIndex={-1} onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>Visual comparison</h2><button data-modal-close onClick={() => { setEvidenceOpen(false); setSharedState({ evidence: undefined }) }}>Close ×</button></div>{visualCases !== undefined ? <EvidenceViewer key={selectedCaseId} card={evidenceCard} methods={evidenceMethods} identities={[]} cases={visualCases} initialMethodAId={evidenceMethodId} initialMethodBId={evidenceComparatorId} initialCaseId={selectedCaseId} onMethodsChange={(a, b) => { setEvidenceMethodId(a); setEvidenceComparatorId(b); setSharedState({ compare: `${a},${b}` }) }} /> : <Loading label="selected source case" />}{caseIndex && caseIndex.filter((c) => c.category === (route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation')).length > 0 && <div className="case-count"><label htmlFor="evidence-case">Frozen case</label><select id="evidence-case" value={selectedCaseId} onChange={(event) => selectCase(event.target.value)}>{caseIndex.filter((c) => c.category === (route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation')).map((c) => <option key={c.id} value={c.id}>{c.label || c.id.slice(0, 12)} · {c.mode === 'worst_case' ? 'outcome-selected QC' : 'representative'}</option>)}</select><span>{caseIndex.filter((c) => c.category === (route === 'robustness-time' ? stressTab === 'spatial' ? 'exact_gt' : 'temporal' : route === 'segformer-deployment' ? 'deployment' : 'real_validation')).length} frozen cases indexed. Media loads for the selected case only.</span></div>}</div></div>}</main><footer className="redesign-footer"><span>Mouse Pupillometry Benchmark · development evidence</span><button onClick={() => go('methods-data')}>Sources and data →</button></footer></div>
}
export default App
