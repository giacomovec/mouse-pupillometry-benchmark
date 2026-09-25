import type { MethodIdentity, MethodRecord, MetricCard } from './types'

export type SortMode = 'best' | 'registry' | 'worst'

function getValue(method: MethodRecord): number | undefined {
  return typeof method.value === 'number' && Number.isFinite(method.value) ? method.value : undefined
}

export function orderedMethods(
  card: MetricCard,
  methods: MethodRecord[],
  identities: MethodIdentity[],
  sort: SortMode,
): MethodRecord[] {
  const identityOrder = new Map<string, number>()
  identities.forEach((item, index) => [item.id, item.variantId, item.methodId].forEach((key) => { if (key) identityOrder.set(key, index) }))
  const copy = [...methods]
  if (sort === 'registry') {
    return copy.sort((a, b) =>
      (identityOrder.get(a.methodId ?? a.id ?? '') ?? identityOrder.get(a.id ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (identityOrder.get(b.methodId ?? b.id ?? '') ?? identityOrder.get(b.id ?? '') ?? Number.MAX_SAFE_INTEGER),
    )
  }
  if (card.direction === 'target' && typeof card.targetValue !== 'number') {
    throw new Error(`Target metric ${card.id} must declare targetValue`)
  }
  const direction = card.direction === 'higher' ? -1 : 1
  return copy.sort((a, b) => {
    const av = getValue(a)
    const bv = getValue(b)
    if (av === undefined && bv === undefined) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    const compare = card.direction === 'target' ? Math.abs(av - card.targetValue!) - Math.abs(bv - card.targetValue!) : (av - bv) * direction
    return sort === 'best' ? compare : -compare
  })
}

function methodColor(method: MethodRecord, identities: MethodIdentity[]) {
  const identity = identities.find((item) => [item.methodId, item.id, item.variantId].includes(method.methodId ?? method.id ?? ''))
  return method.color ?? identity?.color ?? method.familyColor ?? identity?.familyColor ?? '#77838b'
}

function errorBounds(method: MethodRecord, value: number) {
  if (Array.isArray(method.interval) && method.interval.length === 2) return [method.interval[0], method.interval[1]] as const
  if (typeof method.lower === 'number' && typeof method.upper === 'number') return [method.lower, method.upper] as const
  if (typeof method.errorLow === 'number' || typeof method.errorHigh === 'number') {
    return [value - (method.errorLow ?? 0), value + (method.errorHigh ?? 0)] as const
  }
  if (typeof method.uncertainty === 'number') return [value - method.uncertainty, value + method.uncertainty] as const
  return undefined
}

function fmt(value: number, places = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: places }).format(value)
}

interface MetricChartProps {
  card: MetricCard
  methods: MethodRecord[]
  identities: MethodIdentity[]
  ordered: MethodRecord[]
}

export default function MetricChart({ card, methods, identities, ordered }: MetricChartProps) {
  const values = methods.flatMap((item) => {
    const value = getValue(item)
    return value === undefined ? [] : [value, ...(errorBounds(item, value) ?? [])]
  })
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(0, ...values)
  const spread = maxValue - minValue || Math.abs(maxValue) || 1
  const coverage = /coverage/i.test(card.id) && card.direction === 'higher'
  const coverageMax = card.unit === '%' ? 100 : 1
  const domainMin = coverage ? 0 : minValue - spread * 0.12
  const domainMax = coverage ? coverageMax : Math.max(maxValue + spread * 0.2, card.targetValue ?? -Infinity)
  const plotTop = 20
  const plotBottom = 146
  const plotHeight = plotBottom - plotTop
  const scaleY = (value: number) => plotTop + ((domainMax - value) / (domainMax - domainMin)) * plotHeight
  const zeroY = scaleY(0)
  const slot = 120
  const left = 56
  const width = Math.max(610, left + slot * ordered.length + 30)
  const ticks = Array.from({ length: 4 }, (_, index) => domainMin + (domainMax - domainMin) * index / 3)

  return (
    <div className="chart-scroll" aria-label={`${card.title} all-method vertical bar chart`}>
      <svg className="metric-chart" role="img" viewBox={`0 0 ${width} 300`} style={{ minWidth: width }}>
        <title>{card.title} by method. Bars are ordered by {card.direction === 'higher' ? 'higher values first' : 'lower values first'}.</title>
        {ticks.map((tick, index) => {
          const y = scaleY(tick)
          return <g key={index}>
            <line x1={left - 12} x2={width - 10} y1={y} y2={y} className="chart-gridline" />
            <text x={left - 18} y={y + 4} textAnchor="end" className="chart-tick">{fmt(tick)}</text>
          </g>
        })}
        <line x1={left - 12} x2={width - 10} y1={zeroY} y2={zeroY} className="chart-baseline" />
        {card.direction === 'target' && typeof card.targetValue === 'number' && <g>
          <line x1={left - 12} x2={width - 10} y1={scaleY(card.targetValue)} y2={scaleY(card.targetValue)} stroke="#176b6a" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={left + 2} y={scaleY(card.targetValue) - 5} className="chart-tick">Target {fmt(card.targetValue)}</text>
        </g>}
        {ordered.map((method, index) => {
          const columnLeft = left + index * slot
          const center = columnLeft + slot / 2
          const x = center - 26
          const value = getValue(method)
          const color = methodColor(method, identities)
          const identity = identities.find((m) => [m.methodId, m.id, m.variantId].includes(method.methodId ?? method.id ?? ''))
          const label = method.methodName ?? method.label ?? method.name ?? identity?.label ?? method.methodId
          const failedCoverage = method.status === 'FAIL COVERAGE'
          const labelNode = <foreignObject x={columnLeft + 4} y={162} width={slot - 8} height={52}>
            <div className="chart-method-label" title={label}>{label}</div>
          </foreignObject>
          if (value === undefined || method.unavailable) {
            return <g key={method.methodId}>
              {labelNode}
              <text x={center} y={232} textAnchor="middle" className="chart-unavailable-label">NOT MEASURED</text>
              {(method.backend || method.precision) && <text x={center} y={249} textAnchor="middle" className="chart-variant-badge">{[method.backend, method.precision].filter(Boolean).join(' · ')}</text>}
            </g>
          }
          const valueY = scaleY(value)
          const barY = Math.min(zeroY, valueY)
          const barHeight = Math.max(2, Math.abs(zeroY - valueY))
          const bounds = errorBounds(method, value)
          const exactValue = method.valueText ?? String(value)
          const chartValue = fmt(value, 3)
          const unit = method.unit ?? card.unit
          const tooltip = `${label}: ${exactValue} ${unit ?? ''}${bounds ? `; interval ${String(bounds[0])} to ${String(bounds[1])}` : ''}${method.backend || method.precision ? `; ${method.backend ?? ''} ${method.precision ?? ''}` : ''}${failedCoverage ? '; FAIL COVERAGE' : ''}`
          return <g key={method.methodId}>
            <title>{tooltip}</title>
            <rect x={x} y={barY} width={52} height={barHeight} rx={5} fill={color} className="chart-bar" />
            {failedCoverage && <rect x={x} y={barY} width={52} height={barHeight} rx={5} className="chart-failed-outline" />}
            {bounds && <g className="chart-errorbar">
              <line x1={center} x2={center} y1={scaleY(bounds[0])} y2={scaleY(bounds[1])} />
              <line x1={center - 6} x2={center + 6} y1={scaleY(bounds[0])} y2={scaleY(bounds[0])} />
              <line x1={center - 6} x2={center + 6} y1={scaleY(bounds[1])} y2={scaleY(bounds[1])} />
            </g>}
            {labelNode}
            <text x={center} y={232} textAnchor="middle" className="chart-method-value">{chartValue}{unit ? ` ${unit}` : ''}</text>
            {(method.backend || method.precision) && <text x={center} y={249} textAnchor="middle" className="chart-variant-badge">{[method.backend, method.precision].filter(Boolean).join(' · ')}</text>}
            {typeof method.n === 'number' && <text x={center} y={266} textAnchor="middle" className="chart-method-n">n={fmt(method.n, 0)}</text>}
            {failedCoverage && <text x={center} y={284} textAnchor="middle" className="chart-failed-label">FAIL COVERAGE</text>}
          </g>
        })}
      </svg>
    </div>
  )
}
