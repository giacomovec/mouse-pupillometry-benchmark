import { useEffect, useMemo, useRef, useState } from 'react'
import { findVisualCases } from './data'
import type { BenchmarkData, MethodIdentity, MethodRecord, MetricCard } from './types'
import EvidenceViewer from './EvidenceViewer'
import MetricChart, { orderedMethods, type SortMode } from './MetricChart'
import { RiskCoveragePlot } from './ScientificFigures'
import type { RiskCoverageSeries } from './ScientificFigures'

function labelFor(method: MethodRecord, identities: MethodIdentity[]) {
  return method.methodName ?? method.label ?? method.name
    ?? identities.find((identity) => [identity.methodId, identity.id, identity.variantId].includes(method.methodId ?? method.id ?? ''))?.label
    ?? method.methodId
}

function hasValue(method: MethodRecord) {
  return typeof method.value === 'number' && Number.isFinite(method.value) && !method.unavailable
}

function SeedObservationPanel({ methods, identities, primary = false }: { methods: MethodRecord[]; identities: MethodIdentity[]; primary?: boolean }) {
  const rows = methods.flatMap((method) => (method.perSeed ?? []).flatMap((observation) =>
    typeof observation.value === 'number' && Number.isFinite(observation.value)
      ? [{ method, observation, seed: String(observation.seedId ?? observation.seed ?? 'seed') }]
      : [],
  ))
  if (!rows.length) return null
  const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const values = rows.map((row) => row.observation.value as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1
  const y = (value: number) => 20 + (max - value + span * 0.08) * 125 / (span * 1.16)
  const x = (index: number) => 46 + (seeds.length < 2 ? 0 : index * 680 / (seeds.length - 1))
  const colorFor = (method: MethodRecord) => method.color ?? identities.find((identity) => [identity.methodId, identity.id, identity.variantId].includes(method.methodId))?.color ?? '#75858a'
  return <details className="seed-observations" open={primary || undefined}>
    <summary><span className="chevron">⌄</span> RAW PER-SEED OBSERVATIONS <small>{rows.length} source rows · no cross-seed mean</small></summary>
    <div className="seed-panel-body">
      <svg viewBox="0 0 760 175" role="img" aria-label="Raw temporal metric values by frozen seed">
        {seeds.map((seed, index) => <g key={seed}>
          <line x1={x(index)} x2={x(index)} y1="17" y2="151" className="seed-gridline" />
          <text x={x(index)} y="168" textAnchor="middle" className="seed-label">{seed}</text>
        </g>)}
        {methods.map((method) => {
          const pointRows = (method.perSeed ?? []).flatMap((observation) => {
            if (typeof observation.value !== 'number' || !Number.isFinite(observation.value)) return []
            const seed = String(observation.seedId ?? observation.seed ?? 'seed')
            const index = seeds.indexOf(seed)
            return index < 0 ? [] : [{ x: x(index), y: y(observation.value), value: observation.value, seed }]
          })
          return <g key={method.methodId}>
            {pointRows.length > 1 && <path d={pointRows.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} fill="none" stroke={colorFor(method)} strokeWidth="1.6" opacity=".72" />}
            {pointRows.map((point) => <g key={point.seed}><title>{`${method.methodName ?? method.methodId} · ${point.seed}: ${String(point.value)} ${method.unit ?? ''}`}</title><circle cx={point.x} cy={point.y} r="4" fill={colorFor(method)} stroke="#fff" strokeWidth="1.3" /></g>)}
          </g>
        })}
      </svg>
      <div className="seed-table">
        {methods.filter((method) => method.perSeed?.length).map((method) => <div className="seed-table-row" key={method.methodId}>
          <b><i style={{ background: colorFor(method) }} />{labelFor(method, identities)}</b>
          {(method.perSeed ?? []).map((observation, index) => <span key={`${method.methodId}-${observation.seedId ?? observation.seed ?? index}`}><small>{String(observation.seedId ?? observation.seed ?? 'seed')}</small><strong>{observation.value === null || observation.value === undefined ? observation.status ?? 'N/A' : String(observation.value)}</strong></span>)}
        </div>)}
      </div>
    </div>
  </details>
}

export function metricMethods(card: MetricCard, flags: { representations: boolean; deployments: boolean }) {
  return (card.methods ?? []).filter((method) => {
    if (card.category === 'deployment') return true
    if (!flags.representations && (method.canonical === false || method.isCanonical === false)) return false
    const isDeploymentVariant = Boolean(method.backend || method.precision || method.deployment)
    if (card.category !== 'deployment' && !flags.deployments && isDeploymentVariant && method.canonical !== true && method.isCanonical !== true) return false
    return true
  })
}

function Provenance({ card, data, identities, methods }: {
  card: MetricCard
  data: BenchmarkData
  identities: MethodIdentity[]
  methods: MethodRecord[]
}) {
  const families = card.acquisitionFamilies?.join(', ')
  return <details className="provenance-details">
    <summary><span className="chevron">⌄</span> DETAILS / PROVENANCE</summary>
    <div className="provenance-body">
      <div className="provenance-grid">
        <div><small>Benchmark version</small><strong>{card.benchmarkVersion ?? data.manifest.version ?? 'Not exported'}</strong></div>
        <div><small>Formal pre-external freeze</small><strong>{card.freeze ?? data.manifest.freeze ?? 'Pending'}</strong></div>
        <div><small>Source population</small><strong>{card.sourcePopulation ?? card.source ?? 'Not exported'}</strong></div>
        <div><small>N</small><strong>{card.n ?? 'Not reported'}</strong></div>
        <div><small>Acquisition families</small><strong>{families || 'Not reported'}</strong></div>
        <div><small>Representation</small><strong>{String(card.representation ?? card.canonicalCondition ?? 'Per-method condition')}</strong></div>
        <div><small>Operating threshold</small><strong>{card.operatingThreshold ?? 'Not reported'}</strong></div>
        <div><small>Runtime protocol</small><strong>{String(card.runtimeProtocol ?? 'Not applicable / not reported')}</strong></div>
      </div>
      <div className="provenance-methods">
        <div className="provenance-method-head"><strong>Method records</strong><span>Unavailable entries and hash references remain visible here.</span></div>
        {methods.map((method) => <div className="provenance-method-row" key={method.methodId}>
          <span className="method-dot" style={{ background: method.color ?? identities.find((identity) => [identity.methodId, identity.id, identity.variantId].includes(method.methodId))?.color ?? '#829098' }} />
          <b>{labelFor(method, identities)}</b>
          <span>{method.representation ?? 'Representation not reported'}</span>
          <span>{method.backend || method.precision ? `${method.backend ?? 'backend n/a'} · ${method.precision ?? 'precision n/a'}` : method.operatingPoint ?? ''}</span>
          <code>{method.unavailable || method.value === null ? method.unavailableReason ?? method.status ?? 'NOT MEASURED' : method.valueText ?? String(method.value ?? '—')}</code>
          <small>checkpoint {method.checkpointHash ?? 'n/a'}<br />score {method.scoreManifestHash ?? 'n/a'}</small>
        </div>)}
        {card.provenance && <details className="raw-provenance"><summary>Additional exported provenance fields</summary><pre>{JSON.stringify(card.provenance, null, 2)}</pre></details>}
      </div>
    </div>
  </details>
}

export default function MetricCardView({ card, data, identities, flags }: {
  card: MetricCard
  data: BenchmarkData
  identities: MethodIdentity[]
  flags: { representations: boolean; deployments: boolean }
}) {
  const [expanded, setExpanded] = useState(false)
  const [sort, setSort] = useState<SortMode>('best')
  const articleRef = useRef<HTMLElement | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const filteredMethods = useMemo(() => metricMethods(card, flags), [card, flags])
  const ordered = useMemo(() => orderedMethods(card, filteredMethods, identities, sort), [card, filteredMethods, identities, sort])
  const orderedWithColors = ordered.map((method) => {
    const identity = identities.find((item) => [item.methodId, item.id, item.variantId].includes(method.methodId))
    return { ...method, color: method.color ?? identity?.color, familyColor: method.familyColor ?? identity?.familyColor }
  })
  const missing = filteredMethods.filter((method) => !hasValue(method))
  const methodIdentities = identities.map((identity) => ({
    methodId: identity.methodId ?? '',
    id: identity.id,
    variantId: identity.variantId,
    color: identity.color,
    familyColor: identity.familyColor,
  }))
  const available = filteredMethods.filter(hasValue)
  const curveOnly = available.length === 0 && filteredMethods.some((method) => (method.riskCoverage?.length ?? 0) > 3)
  const seedOnly = available.length === 0 && filteredMethods.some((method) => (method.perSeed?.length ?? 0) > 0)
  const riskCurves: RiskCoverageSeries[] = curveOnly ? filteredMethods.filter((method) => (method.riskCoverage?.length ?? 0) > 3).map((method) => ({
    id: method.methodId,
    label: labelFor(method, identities),
    color: method.color,
    points: (method.riskCoverage ?? []).map((point) => ({ coveragePercent: point.coverage * 100, riskPercent: point.risk * 100, retained: point.retained, attempted: point.attempted })),
  })) : []
  const cases = findVisualCases(data, card, 'representative').concat(findVisualCases(data, card, 'worst_case'))
  const displayTitle = card.title ?? card.label ?? card.id

  useEffect(() => {
    const node = articleRef.current
    if (!node || chartReady) return
    if (!('IntersectionObserver' in window)) { setChartReady(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setChartReady(true)
        observer.disconnect()
      }
    }, { rootMargin: '700px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [chartReady])

  return <article ref={articleRef} className="metric-card" id={`metric-${card.id}`}>
    <div className="metric-card-main">
      <header className="metric-card-head">
        <div>
          <div className="metric-card-label"><span className="card-index">{card.id}</span><span className="metric-direction">{card.direction === 'lower' ? 'LOWER IS BETTER' : card.direction === 'higher' ? 'HIGHER IS BETTER' : card.direction === 'target' ? 'TARGET RANGE' : 'METRIC'}</span></div>
          <h3>{displayTitle}</h3>
          <p>{card.explanation ?? card.description ?? 'Metric exported from the frozen benchmark tables.'}</p>
        </div>
        <div className="metric-attrs">
          <span><small>UNIT</small><b>{card.unit ?? '—'}</b></span>
          <span><small>N</small><b>{card.n ?? '—'}</b></span>
          {card.operatingThreshold !== undefined && card.operatingThreshold !== null && <span><small>THRESHOLD</small><b>{String(card.operatingThreshold)}</b></span>}
        </div>
      </header>
      <div className="chart-header">
        <div className="chart-title"><span>{curveOnly ? 'RISK–COVERAGE CURVES' : seedOnly ? 'PER-SEED OBSERVATIONS' : 'METHOD COMPARISON'}</span><b>{curveOnly ? `${riskCurves.length} source curves` : seedOnly ? 'No pooled point estimate' : `${available.length} scored${missing.length ? ` · ${missing.length} not measured` : ''}`}</b></div>
        <label className="sort-select">SORT<select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
          <option value="best">Best to worst</option><option value="registry">Method registry</option><option value="worst">Worst to best</option>
        </select></label>
      </div>
      {curveOnly ? <RiskCoveragePlot curves={riskCurves} /> : seedOnly ? <SeedObservationPanel methods={filteredMethods} identities={identities} primary /> : filteredMethods.length ? chartReady ? <MetricChart card={card} methods={filteredMethods} identities={identities} ordered={ordered} /> : <div className="chart-lazy-space" aria-label="Chart loads when near the viewport"><span>SCIENTIFIC CHART · LOADS ON APPROACH</span></div> : <div className="chart-empty">No method records were exported for this metric.</div>}
      {card.category === 'temporal' && !seedOnly && <SeedObservationPanel methods={filteredMethods} identities={identities} />}
      {missing.length > 0 && <div className="missing-methods"><span>NOT MEASURED</span>{missing.map((method) => <em key={method.methodId}>{labelFor(method, identities)}{method.unavailableReason ? ` · ${method.unavailableReason}` : ''}</em>)}</div>}
      <button className={`evidence-toggle ${expanded ? 'open' : ''}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="toggle-arrow">{expanded ? '⌃' : '⌄'}</span><span>{expanded ? 'HIDE VISUAL COMPARISON' : 'SHOW VISUAL COMPARISON'}</span>
        <small>{cases.length ? `${cases.length} frozen case${cases.length === 1 ? '' : 's'}` : 'evidence export pending'}</small>
      </button>
      {expanded && <EvidenceViewer card={card} methods={orderedWithColors} identities={methodIdentities} cases={cases} />}
      <Provenance card={card} data={data} identities={identities} methods={filteredMethods} />
    </div>
  </article>
}
