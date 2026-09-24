import { useEffect, useMemo, useState } from 'react'
import CapabilityMatrix from './CapabilityMatrix'
import MetricCardView from './MetricCardView'
import { loadBenchmarkData } from './data'
import type { BenchmarkData, CategoryId, MetricCard } from './types'

const NAV: Array<{ id: string; label: string; category?: CategoryId }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'real-validation', label: 'Real validation', category: 'real_validation' },
  { id: 'geometry', label: 'Geometry', category: 'geometry' },
  { id: 'segmentation', label: 'Segmentation', category: 'segmentation' },
  { id: 'coverage-risk', label: 'Coverage & risk', category: 'coverage_risk' },
  { id: 'exact-gt', label: 'Exact GT', category: 'exact_gt' },
  { id: 'temporal', label: 'Temporal', category: 'temporal' },
  { id: 'runtime', label: 'Runtime', category: 'runtime' },
  { id: 'deployment', label: 'Deployment', category: 'deployment' },
  { id: 'capabilities', label: 'Capabilities', category: 'capabilities' },
  { id: 'provenance', label: 'Provenance' },
]

const SECTION_COPY: Partial<Record<CategoryId, { title: string; lead: string }>> = {
  real_validation: { title: 'Real validation', lead: 'Frozen measurements on real mouse-eye material. Values below are read from the exported benchmark tables.' },
  geometry: { title: 'Geometry', lead: 'Diameter, center, axes, area, and orientation measurements with uncertainty where the source supports it.' },
  segmentation: { title: 'Segmentation', lead: 'Mask-level overlap and boundary measurements. Mask evidence uses the exported masks themselves.' },
  coverage_risk: { title: 'Coverage & risk', lead: 'Accepted-frame coverage and selective risk at frozen confidence operating points.' },
  exact_gt: { title: 'Exact GT', lead: 'Controlled perturbations with exact transformed geometry and paired method outputs.' },
  temporal: { title: 'Temporal', lead: 'Trajectory fidelity includes gain, phase, transient response, and bandwidth alongside error.' },
  runtime: { title: 'Runtime', lead: 'Synchronized playback shows the shared input stream; timings come from the frozen benchmark harness.' },
  deployment: { title: 'Deployment', lead: 'Deployment variants remain visible across backend and precision conditions, including failed conditions.' },
  capabilities: { title: 'Capabilities', lead: 'Qualitative and workflow capabilities are exported alongside their evidence and limitations.' },
}

function metricCount(data: BenchmarkData) {
  return Object.values(data.cardsByCategory).reduce((sum, cards) => sum + cards.length, 0)
}

function distinct(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b))
}

function pretty(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not exported'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return JSON.stringify(value)
}

function compactStatus(value: unknown): string {
  const raw = pretty(value)
  if (raw === 'EXPORTED_FROM_CANONICAL_DEVELOPMENT_TABLES') return 'Development results'
  if (raw === 'EXPORTED_FROM_CANONICAL_SPATIAL_SUMMARIES') return 'Spatial results'
  if (raw === 'EXPORTED_WITH_METHOD_SPECIFIC_COVERAGE_AND_PER_SEED_FIDELITY') return 'Qualified results'
  if (raw === 'QUALIFIED_COMPLETE_VERIFIED_SUBSET_WITH_EXCLUSIONS') return 'Verified subset'
  if (raw === 'ALL_30_CONDITIONS_INCLUDING_EXECUTED_INT8_FAIL_COVERAGE') return '30 conditions · INT8 failed'
  return raw
}

function StatusChip({ label, value }: { label: string; value?: unknown }) {
  const text = compactStatus(value)
  const state = text.toLowerCase()
  const cls = /pass|complete|closed|available|measured/.test(state) ? 'good' : /pending|open|not|withheld|n\/a/.test(state) ? 'pending' : 'neutral'
  return <span className={`status-chip ${cls}`}><i />{label}<b>{text}</b></span>
}

function categoryStatus(data: BenchmarkData, key: string) {
  const status = data.manifest.status
  const gates = data.manifest.gates
  const obj = status && typeof status === 'object' ? status as Record<string, unknown> : undefined
  return obj?.[key] ?? gates?.[key]
}

function ProvenanceOverview({ data }: { data: BenchmarkData }) {
  return <section className="site-section provenance-section" id="provenance">
    <div className="section-heading">
      <div><span className="section-kicker">SOURCE RECORD</span><h2>Provenance</h2><p>Versioned export identity, file hashes, and population notes used by this static explorer.</p></div>
    </div>
    <div className="provenance-overview-grid">
      <div><small>Benchmark version</small><strong>{data.manifest.version ?? 'Export pending'}</strong></div>
      <div><small>Formal pre-external freeze</small><strong>{data.manifest.freeze ?? 'Pending'}</strong></div>
      <div><small>Export time</small><strong>{data.manifest.generatedAt ?? 'Not recorded'}</strong></div>
      <div><small>Exported metric cards</small><strong>{metricCount(data)}</strong></div>
      <div><small>Visual cases</small><strong>{data.visualCases.length}</strong></div>
      <div><small>Methods in identity registry</small><strong>{data.methods.length}</strong></div>
    </div>
    <details className="provenance-details global-provenance"><summary><span className="chevron">⌄</span> EXPANDED MANIFEST AND PROVENANCE</summary><div className="provenance-body json-panels">
      <div><h3>Benchmark manifest</h3><pre>{JSON.stringify(data.manifest, null, 2)}</pre></div>
      <div><h3>Provenance export</h3><pre>{JSON.stringify(data.provenance, null, 2)}</pre></div>
      <div><h3>Method identities</h3><pre>{JSON.stringify(data.methods, null, 2)}</pre></div>
    </div></details>
  </section>
}

function App() {
  const [data, setData] = useState<BenchmarkData>()
  const [loadError, setLoadError] = useState<string>()
  const [active, setActive] = useState('overview')
  const [showRepresentationVariants, setShowRepresentationVariants] = useState(false)
  const [showDeploymentVariants, setShowDeploymentVariants] = useState(false)
  const [modelFilter, setModelFilter] = useState('')
  const [backendFilter, setBackendFilter] = useState('')
  const [precisionFilter, setPrecisionFilter] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!data) return
    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
    }
    scrollToHash()
    // Nearby lazy charts can change the document height after the first jump.
    const observer = new ResizeObserver(scrollToHash)
    observer.observe(document.body)
    const stop = window.setTimeout(() => observer.disconnect(), 1500)
    window.addEventListener('hashchange', scrollToHash)
    return () => {
      window.clearTimeout(stop)
      observer.disconnect()
      window.removeEventListener('hashchange', scrollToHash)
    }
  }, [data])

  useEffect(() => {
    let alive = true
    loadBenchmarkData().then((loaded) => { if (alive) setData(loaded) }).catch((error) => {
      if (alive) setLoadError(error instanceof Error ? error.message : String(error))
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setActive(visible.target.id)
    }, { rootMargin: '-100px 0px -74% 0px', threshold: 0 })
    NAV.forEach((item) => { const node = document.getElementById(item.id); if (node) observer.observe(node) })
    return () => observer.disconnect()
  }, [data])

  const deployRows = useMemo(() => data ? data.cardsByCategory.deployment.flatMap((card) => card.methods ?? []) : [], [data])
  const models = distinct(deployRows.map((method) => method.architecture ?? method.variant))
  const backends = distinct(deployRows.map((method) => method.backend))
  const precisions = distinct(deployRows.map((method) => method.precision))
  const flags = { representations: showRepresentationVariants, deployments: showDeploymentVariants }
  const totalCards = data ? metricCount(data) : 0

  const visibleCards = (category: CategoryId) => {
    const source = data?.cardsByCategory[category] ?? []
    return source.filter((card) => {
      const text = `${card.title} ${card.explanation ?? ''} ${card.id}`.toLowerCase()
      return text.includes(query.toLowerCase())
    })
  }

  const deploymentCondition = (card: MetricCard): MetricCard => {
    if (card.category !== 'deployment') return card
    return {
      ...card,
      methods: (card.methods ?? []).filter((method) => {
        const model = method.architecture ?? method.variant
        return (!modelFilter || model === modelFilter)
          && (!backendFilter || method.backend === backendFilter)
          && (!precisionFilter || method.precision === precisionFilter)
      }),
    }
  }

  const goTo = (id: string) => {
    setActive(id)
    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="app-shell">
    <header className="masthead">
      <div className="masthead-top">
        <a className="wordmark" href="#overview" onClick={(event) => { event.preventDefault(); goTo('overview') }}><span className="mark-eye"><i /></span><span>Mouse Pupillometry Benchmark</span></a>
        <span className="internal-badge"><span /> COLLABORATOR BENCHMARK EXPLORER</span>
      </div>
      <div className="masthead-meta">
        <div><span className="development-label">DEVELOPMENT BENCHMARK</span><span className="subheader">Development benchmark · {data?.manifest.version ?? data?.manifest.freeze ?? 'version pending export'}</span></div>
        <div className="external-state"><span className="status-dot" />External evaluation not yet opened</div>
      </div>
      <div className="status-strip">
        <StatusChip label="Real validation" value={data ? categoryStatus(data, 'realValidation') ?? (data.cardsByCategory.real_validation.length ? 'Exported' : 'Pending') : 'Loading'} />
        <StatusChip label="Exact-GT" value={data ? categoryStatus(data, 'exactGt') ?? (data.cardsByCategory.exact_gt.length ? 'Exported' : 'Pending') : 'Loading'} />
        <StatusChip label="Temporal" value={data ? categoryStatus(data, 'temporal') ?? (data.cardsByCategory.temporal.length ? 'Exported' : 'Pending') : 'Loading'} />
        <StatusChip label="Runtime" value={data ? categoryStatus(data, 'runtime') ?? (data.cardsByCategory.runtime.length ? 'Exported' : 'Pending') : 'Loading'} />
        <StatusChip label="Deployment" value={data ? categoryStatus(data, 'deployment') ?? (data.cardsByCategory.deployment.length ? 'Exported' : 'Pending') : 'Loading'} />
        <StatusChip label="External validation" value="Not opened" />
      </div>
    </header>

    <nav className="top-nav" aria-label="Benchmark sections">
      <div className="nav-inner">{NAV.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => goTo(item.id)}>{item.label}</button>)}</div>
    </nav>

    <main>
      <section className="overview-section" id="overview">
        <div className="overview-heading">
          <div><span className="section-kicker">BENCHMARK STATUS / STATIC EXPORT</span><h1>Evidence, arranged for review.</h1><p>Explore measurement quality, failure profiles, timing, and deployment conditions across the current development benchmark.</p></div>
          <div className="overview-state-card"><span className="state-led" /><div><b>Development benchmark</b><small>External evaluation has not been opened.</small></div><span className="state-corner">PRE-EXTERNAL</span></div>
        </div>
        <div className="overview-facts">
          <div><small>EXPORT VERSION</small><b>{data?.manifest.version ?? 'Pending export'}</b></div>
          <div><small>METRIC CARDS</small><b>{data ? totalCards : '—'}</b></div>
          <div><small>VISUAL CASES</small><b>{data ? data.visualCases.length : '—'}</b></div>
          <div><small>METHOD REGISTRY</small><b>{data ? data.methods.length : '—'}</b></div>
        </div>
        <div className="overview-tools">
          <label className="search-field"><span>⌕</span><input aria-label="Filter metrics and capabilities" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter metrics and capabilities by name or description" /></label>
          <div className="variant-toggles">
            <label><input type="checkbox" checked={showRepresentationVariants} onChange={(event) => setShowRepresentationVariants(event.target.checked)} /> SHOW REPRESENTATION VARIANTS</label>
            <label><input type="checkbox" checked={showDeploymentVariants} onChange={(event) => setShowDeploymentVariants(event.target.checked)} /> SHOW DEPLOYMENT VARIANTS</label>
          </div>
        </div>
        <div className="overview-note"><span className="note-mark">i</span><span>Scientific values are loaded from the versioned export. The site presents frozen tables and media; it does not recalculate benchmark results.</span><span className="updated-at">{data?.manifest.generatedAt ? `EXPORTED ${data.manifest.generatedAt}` : data ? 'VERSIONED EXPORT LOADED' : 'WAITING FOR DATA EXPORT'}</span></div>
        {loadError && <div className="data-error">Could not load benchmark export: {loadError}</div>}
        {data?.loadErrors.length ? <details className="data-load-details"><summary>Some optional export files are not available yet ({data.loadErrors.length})</summary><ul>{data.loadErrors.map((error) => <li key={error}>{error}</li>)}</ul></details> : null}
      </section>

      {NAV.filter((item) => item.category).map((item) => {
        const category = item.category!
        const cards = visibleCards(category)
        const copy = SECTION_COPY[category]!
        const sectionCount = category === 'capabilities' && data ? data.capabilityMatrix.length : cards.length
        return <section className="site-section" id={item.id} key={item.id}>
          <div className="section-heading">
            <div><span className="section-kicker">{item.label.toUpperCase()} / {String(sectionCount).padStart(2, '0')} {category === 'capabilities' ? 'DEFINITIONS' : 'METRICS'}</span><h2>{copy.title}</h2><p>{copy.lead}</p></div>
            <div className="section-meta">{data?.manifest.version ?? 'version pending'}<span>Static export</span></div>
          </div>
          {category === 'deployment' && <div className="deployment-filters">
            <div className="deployment-filter-head"><span className="section-kicker">DEPLOYMENT CONDITIONS</span><p>Backend and precision badges preserve the model’s canonical color family.</p></div>
            <label>MODEL<select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="">All models</option>{models.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>BACKEND<select value={backendFilter} onChange={(event) => setBackendFilter(event.target.value)}><option value="">All backends</option>{backends.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>PRECISION<select value={precisionFilter} onChange={(event) => setPrecisionFilter(event.target.value)}><option value="">All precision</option>{precisions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>}
          {category === 'runtime' && <div className="runtime-disclaimer">Playback is synchronized for visual comparison. Runtime values come from the frozen timing harness.</div>}
          {category === 'capabilities' && data
            ? <CapabilityMatrix definitions={data.capabilityMatrix} identities={data.methods} query={query} />
            : cards.length && data
              ? cards.map((card) => <MetricCardView key={card.id} card={deploymentCondition(card)} data={data} identities={data.methods} flags={flags} />)
              : <div className="section-empty"><span>◌</span><b>{query ? 'No metric cards match this filter.' : 'Metrics are waiting for the canonical export.'}</b><small>{query ? 'Clear or change the search field above.' : 'This section will populate from the versioned benchmark data.'}</small></div>}
        </section>
      })}
      {data && <ProvenanceOverview data={data} />}
    </main>

    <footer className="site-footer"><span><span className="mark-eye small"><i /></span> Mouse Pupillometry Benchmark</span><span>Internal collaborator-facing scientific explorer · Development benchmark</span><button onClick={() => goTo('overview')}>Back to top ↑</button></footer>
  </div>
}

export default App
