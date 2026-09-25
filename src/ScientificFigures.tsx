import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import './ScientificFigures.css'

export interface AccuracyCoverageDatum {
  id: string
  label: string
  coveragePercent: number
  accuracyPercent: number
  color?: string
  family?: string
  model?: string
  representation?: string
  operatingPoint?: string
  backend?: string
  precision?: string
  accepted?: number | null
  attempted?: number | null
  accuracyLowerPercent?: number | null
  accuracyUpperPercent?: number | null
  connectionId?: string
  metadata?: Record<string, string | number | null | undefined>
}

export interface PairedDifferenceDatum {
  id: string
  label: string
  difference: number
  lower: number | null
  upper: number | null
  color?: string
  detail?: string
}

export interface DotIntervalDatum {
  id: string
  label: string
  value: number | null
  lower?: number | null
  upper?: number | null
  color?: string
  detail?: string
}

export interface RiskCoveragePoint {
  coveragePercent: number
  riskPercent: number
  retained?: number | null
  attempted?: number | null
}

export interface RiskCoverageSeries {
  id: string
  label: string
  color?: string
  points: RiskCoveragePoint[]
}

export interface TransformSeverityCell {
  id: string
  transform: string
  severity: string | number
  value: number | null
  lower?: number | null
  upper?: number | null
  accepted?: number | null
  attempted?: number | null
  status?: string
}

export interface TransformResponsePoint {
  severity: number
  value: number | null
  lower?: number | null
  upper?: number | null
  accepted?: number | null
  attempted?: number | null
  caseId?: string
}

export interface TransformResponseSeries {
  id: string
  label: string
  color?: string
  points: TransformResponsePoint[]
}

export interface TemporalRmseGainDatum {
  id: string
  label: string
  rmse: number
  gain: number
  color?: string
  coveragePercent?: number | null
  seed?: string | number
}

export interface FrequencyResponsePoint {
  frequencyHz: number
  gain?: number | null
  phaseLagMs?: number | null
  coveragePercent?: number | null
}

export interface FrequencyResponseSeries {
  id: string
  label: string
  color?: string
  points: FrequencyResponsePoint[]
}

export interface StepResponsePoint {
  timeMs: number
  gt?: number | null
  prediction?: number | null
  residual?: number | null
}

export interface StepResponseSeries {
  id: string
  label: string
  color?: string
  points: StepResponsePoint[]
}

export interface RuntimeIntervalDatum {
  id: string
  label: string
  modelOnlyP50Ms?: number | null
  modelOnlyP95Ms?: number | null
  endToEndP50Ms?: number | null
  endToEndP95Ms?: number | null
  color?: string
  detail?: string
}

export type TradeoffDirection = 'lower' | 'higher' | 'target'

export interface TradeoffDatum {
  id: string
  label: string
  x: number | null
  y: number | null
  coveragePercent?: number | null
  color?: string
  status?: string
  comparisonGroup?: string
  comparable?: boolean
  metadata?: Record<string, string | number | null | undefined>
}

export type TradeoffScatterProps = {
  points: TradeoffDatum[]
  xLabel: string
  yLabel: string
  xDirection: TradeoffDirection
  yDirection: TradeoffDirection
  xThreshold?: number
  yThreshold?: number
  xThresholdLabel?: string
  yThresholdLabel?: string
  coverageThresholdPercent?: number
  showFrontier?: boolean
  xDomain?: [number, number]
  yDomain?: [number, number]
  height?: number
  onPointClick?: (point: TradeoffDatum) => void
} & (
  | { xDirection: 'target'; xTarget: number }
  | { xDirection: 'lower' | 'higher'; xTarget?: number }
) & (
  | { yDirection: 'target'; yTarget: number }
  | { yDirection: 'lower' | 'higher'; yTarget?: number }
)

export interface DeploymentFrontierDatum {
  id: string
  label: string
  latencyMs: number | null
  diameterArePercent?: number | null
  coveragePercent?: number | null
  color?: string
  status?: string
  metadata?: Record<string, string | number | null | undefined>
}

export type CoverageGateStatus = 'pass' | 'fail' | 'not-run' | 'unavailable' | 'unknown' | 'executed-failed'

export interface DeploymentMatrixRow {
  id: string
  model: string
  backend: string
  precision: string
  modelOnlyP50Ms?: number | null
  endToEndP50Ms?: number | null
  coveragePercent?: number | null
  diameterArePercent?: number | null
  accuracyDeltaPp?: number | null
  vramMb?: number | null
  modelSizeMb?: number | null
  gateStatus: CoverageGateStatus
  gateLabel?: string
  detail?: string
}

interface ChartBox {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  plotWidth: number
  plotHeight: number
}

const FALLBACK_COLORS = ['#176b5b', '#b26437', '#426f9a', '#8a5f9f', '#827232', '#457d81', '#a04859', '#637548', '#705c4f', '#60717a']
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nice = (value: number, digits = 2) => finite(value) ? Number(value.toFixed(digits)).toString() : 'Not reported'
const percent = (value: number) => `${nice(value)}%`
const countText = (accepted?: number | null, attempted?: number | null) => finite(accepted) && finite(attempted) ? `${Math.round(accepted).toLocaleString()} / ${Math.round(attempted).toLocaleString()}` : null
const colorFor = (color: string | undefined, index: number) => color || FALLBACK_COLORS[index % FALLBACK_COLORS.length]

function useMeasuredWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width)
      if (next > 0) setWidth((previous) => Math.abs(previous - next) > 1 ? next : previous)
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [ref])
  return width
}

function useBox(ref: RefObject<HTMLElement | null>, height: number, margins: { wide?: [number, number, number, number]; narrow?: [number, number, number, number] } = {}): ChartBox {
  const width = useMeasuredWidth(ref)
  const [left, right, top, bottom] = width < 540
    ? margins.narrow ?? [68, 18, 26, 66]
    : margins.wide ?? [76, 24, 26, 66]
  return { width, height, left, right, top, bottom, plotWidth: Math.max(1, width - left - right), plotHeight: Math.max(1, height - top - bottom) }
}

function chartScale(min: number, max: number, start: number, length: number) {
  const span = max - min || 1
  return (value: number) => start + ((value - min) / span) * length
}

function paddedDomain(values: Array<number | null | undefined>, options: { includeZero?: boolean; include?: number[]; pad?: number } = {}): [number, number] {
  const all = [...values.filter(finite), ...(options.include ?? [])]
  if (options.includeZero) all.push(0)
  if (!all.length) return [0, 1]
  let min = Math.min(...all)
  let max = Math.max(...all)
  if (min === max) {
    const adjustment = Math.abs(min) * 0.1 || 1
    min -= adjustment
    max += adjustment
  }
  const extra = (max - min) * (options.pad ?? 0.08)
  if (options.includeZero && min === 0 && max > 0) return [0, max + extra]
  if (options.includeZero && max === 0 && min < 0) return [min - extra, 0]
  return [min - extra, max + extra]
}

function symmetricDomain(values: Array<number | null | undefined>): [number, number] {
  const extent = Math.max(0, ...values.filter(finite).map(Math.abs))
  const limit = extent > 0 ? extent * 1.14 : 1
  return [-limit, limit]
}

function tickValues([min, max]: [number, number], count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => min + ((max - min) * index) / count)
}

function formatTick(value: number) {
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1).replace(/\.0$/, '')
  if (abs >= 1) return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return value.toPrecision(2)
}

function svgMeta(id: string, title: string, description: string) {
  return <><title id={`${id}-title`}>{title}</title><desc id={`${id}-description`}>{description}</desc></>
}

function AxisText({ x, y, value, anchor = 'middle', className }: { x: number; y: number; value: string; anchor?: 'start' | 'middle' | 'end'; className?: string }) {
  return <text x={x} y={y} textAnchor={anchor} className={className}>{value}</text>
}

function AxisY({ x, y, value }: { x: number; y: number; value: string }) {
  return <text x={x} y={y} textAnchor="middle" transform={`rotate(-90 ${x} ${y})`} className="sf-axis-title">{value}</text>
}

function AxisGrid({ box, xScale, yScale, xTicks, yTicks, xFormat = formatTick, yFormat = formatTick }: {
  box: ChartBox
  xScale: (value: number) => number
  yScale: (value: number) => number
  xTicks: number[]
  yTicks: number[]
  xFormat?: (value: number) => string
  yFormat?: (value: number) => string
}) {
  const xBottom = box.height - box.bottom
  return <g className="sf-grid">
    {xTicks.map((tick, index) => <g key={`x-${index}`}><line x1={xScale(tick)} y1={box.top} x2={xScale(tick)} y2={xBottom} /><AxisText x={xScale(tick)} y={xBottom + 20} value={xFormat(tick)} /></g>)}
    {yTicks.map((tick, index) => <g key={`y-${index}`}><line x1={box.left} y1={yScale(tick)} x2={box.width - box.right} y2={yScale(tick)} /><AxisText x={box.left - 10} y={yScale(tick) + 4} value={yFormat(tick)} anchor="end" /></g>)}
    <line className="sf-axis-line" x1={box.left} y1={box.top} x2={box.left} y2={xBottom} />
    <line className="sf-axis-line" x1={box.left} y1={xBottom} x2={box.width - box.right} y2={xBottom} />
  </g>
}

function IntervalMark({ x, y, lower, upper, xScale, color, cap = 5 }: { x: number; y: number; lower: number; upper: number; xScale: (value: number) => number; color: string; cap?: number }) {
  const lowX = xScale(lower)
  const highX = xScale(upper)
  return <g className="sf-interval" stroke={color}>
    <line x1={lowX} y1={y} x2={highX} y2={y} />
    <line x1={lowX} y1={y - cap} x2={lowX} y2={y + cap} />
    <line x1={highX} y1={y - cap} x2={highX} y2={y + cap} />
    <circle cx={x} cy={y} r="5" fill={color} />
  </g>
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: Array<Array<string>> }) {
  return <details className="sf-data-table"><summary>View plotted values</summary><div className="sf-table-scroll"><table><caption>{caption}</caption><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${row[0]}`}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div></details>
}

export function AccuracyCoverageScatter({ points, height = 405, xLabel = 'Accepted-frame coverage (%)', yLabel = 'Family-macro diameter ARE (%)', onPointClick }: {
  points: AccuracyCoverageDatum[]
  height?: number
  xLabel?: string
  yLabel?: string
  onPointClick?: (point: AccuracyCoverageDatum) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [78, 22, 28, 66], narrow: [65, 14, 24, 73] })
  const uid = useId().replace(/:/g, '')
  const validPoints = points.filter((point) => finite(point.coveragePercent) && point.coveragePercent >= 0 && point.coveragePercent <= 100 && finite(point.accuracyPercent) && point.accuracyPercent >= 0)
  const accuracyMax = Math.max(1, ...validPoints.map((point) => point.accuracyPercent), ...validPoints.map((point) => finite(point.accuracyUpperPercent) ? point.accuracyUpperPercent : 0))
  const yDomain: [number, number] = [0, accuracyMax > 0 ? Math.ceil(accuracyMax * 1.1 / 5) * 5 : 1]
  const xScale = chartScale(0, 100, box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yDomain[0], yDomain[1], box.height - box.bottom, -box.plotHeight)(value)
  const grouped = new Map<string, AccuracyCoverageDatum[]>()
  for (const point of validPoints) if (point.connectionId) grouped.set(point.connectionId, [...(grouped.get(point.connectionId) ?? []), point])
  const colorKeys = [...new Set(validPoints.map((point) => point.connectionId ?? point.id))]
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(`${uid}`, 'Accuracy versus accepted-frame coverage', 'Coverage is fixed to zero through one hundred percent. Lower diameter error is better. Dashed connectors join operating points of the same method.')}
        <defs><marker id={`${uid}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#657a73" /></marker><clipPath id={`${uid}-clip`}><rect x={box.left} y={box.top} width={box.plotWidth} height={box.plotHeight} /></clipPath></defs>
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={[0, 25, 50, 75, 100]} yTicks={tickValues(yDomain, 4)} xFormat={(value) => `${value.toFixed(0)}%`} yFormat={(value) => `${formatTick(value)}%`} />
        <g clipPath={`url(#${uid}-clip)`}>
          {[...grouped.entries()].map(([connectionId, connected]) => {
            const ordered = [...connected].sort((a, b) => a.coveragePercent - b.coveragePercent)
            if (ordered.length < 2) return null
            const first = ordered[0]
            const last = ordered[ordered.length - 1]
            return <line key={connectionId} x1={xScale(first.coveragePercent)} y1={yScale(first.accuracyPercent)} x2={xScale(last.coveragePercent)} y2={yScale(last.accuracyPercent)} className="sf-operating-connector" markerEnd={`url(#${uid}-arrow)`} />
          })}
          {validPoints.map((point) => {
            const color = colorFor(point.color, colorKeys.indexOf(point.connectionId ?? point.id))
            const x = xScale(point.coveragePercent)
            const y = yScale(point.accuracyPercent)
            const denominator = countText(point.accepted, point.attempted)
            const detail = [point.family, point.model, point.representation, point.operatingPoint, point.backend, point.precision].filter(Boolean).join(' · ')
            const metadata = Object.entries(point.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => `${key}: ${String(value)}`).join('; ')
            const accessible = `${point.label}: ${percent(point.accuracyPercent)} diameter ARE at ${percent(point.coveragePercent)} coverage${denominator ? `; accepted / attempted ${denominator}` : ''}${detail ? `; ${detail}` : ''}${metadata ? `; ${metadata}` : ''}`
            return <g key={point.id} className="sf-point-group">
              {finite(point.accuracyLowerPercent) && finite(point.accuracyUpperPercent) && <g stroke={color} className="sf-vertical-interval"><line x1={x} y1={yScale(point.accuracyLowerPercent)} x2={x} y2={yScale(point.accuracyUpperPercent)} /><line x1={x - 5} y1={yScale(point.accuracyLowerPercent)} x2={x + 5} y2={yScale(point.accuracyLowerPercent)} /><line x1={x - 5} y1={yScale(point.accuracyUpperPercent)} x2={x + 5} y2={yScale(point.accuracyUpperPercent)} /></g>}
              <circle cx={x} cy={y} r="6" fill={color} stroke="#ffffff" strokeWidth="2" role={onPointClick ? 'button' : undefined} tabIndex={onPointClick ? 0 : undefined} aria-label={accessible} onClick={() => onPointClick?.(point)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && onPointClick) onPointClick(point) }}><title>{accessible}</title></circle>
            </g>
          })}
        </g>
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 14} value={xLabel} className="sf-axis-title" />
        <AxisY x={17} y={box.top + box.plotHeight / 2} value={yLabel} />
      </svg>
    </div>
    <figcaption className="sf-caption">Each point is an exported operating point. Connected points are the same method at different thresholds; they show the accuracy cost of accepting more frames. No method ranking is implied across different coverage levels.</figcaption>
    <ul className="sf-legend">{validPoints.map((point) => <li key={point.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(point.color, colorKeys.indexOf(point.connectionId ?? point.id)) }} /><span>{point.label}{point.operatingPoint ? <small>{point.operatingPoint}</small> : null}</span></li>)}</ul>
    <DataTable caption="Accuracy and coverage points" headers={['Method / condition', 'Coverage (%)', 'Diameter ARE (%)', 'Accepted / attempted']} rows={points.map((point) => [point.label, finite(point.coveragePercent) ? percent(point.coveragePercent) : 'Not reported', finite(point.accuracyPercent) ? percent(point.accuracyPercent) : 'Not reported', countText(point.accepted, point.attempted) ?? 'Not reported'])} />
  </figure>
}

export function PairedDifferenceForest({ rows, height, valueLabel = 'Paired difference (percentage points)', note }: {
  rows: PairedDifferenceDatum[]
  height?: number
  valueLabel?: string
  note?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartHeight = height ?? Math.max(230, rows.length * 58 + 92)
  const box = useBox(ref, chartHeight, { wide: [235, 20, 23, 62], narrow: [178, 12, 23, 62] })
  const uid = useId().replace(/:/g, '')
  const all = rows.flatMap((row) => [row.difference, row.lower ?? undefined, row.upper ?? undefined])
  const domain = symmetricDomain(all)
  const xScale = chartScale(domain[0], domain[1], box.left, box.plotWidth)
  const top = box.top + 4
  const rowSpace = box.plotHeight / Math.max(rows.length, 1)
  const y = (index: number) => top + rowSpace * (index + 0.5)
  const axisY = box.height - box.bottom
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Paired family-level difference intervals', `A vertical zero line marks no difference. Horizontal intervals are acquisition-family bootstrap intervals. ${note ?? ''}`)}
        {tickValues(domain, 4).map((tick, index) => <g key={index}><line x1={xScale(tick)} y1={box.top} x2={xScale(tick)} y2={axisY} className={Math.abs(tick) < 1e-9 ? 'sf-reference-line' : 'sf-grid-line'} /><AxisText x={xScale(tick)} y={axisY + 20} value={formatTick(tick)} /></g>)}
        <line className="sf-axis-line" x1={box.left} y1={axisY} x2={box.width - box.right} y2={axisY} />
        <line className="sf-reference-line sf-reference-strong" x1={xScale(0)} y1={box.top} x2={xScale(0)} y2={axisY} />
        {rows.map((row, index) => {
          const yy = y(index)
          const color = colorFor(row.color, index)
          const accessible = `${row.label}: ${nice(row.difference)}${finite(row.lower) && finite(row.upper) ? `, 95 percent interval ${nice(row.lower)} to ${nice(row.upper)}` : ', interval not reported'}${row.detail ? `; ${row.detail}` : ''}`
          return <g key={row.id}>
            <AxisText x={box.left - 12} y={yy + 4} value={row.label} anchor="end" className="sf-row-label" />
            {finite(row.lower) && finite(row.upper) && <g className="sf-interval" stroke={color}><line x1={xScale(row.lower)} y1={yy} x2={xScale(row.upper)} y2={yy} /><line x1={xScale(row.lower)} y1={yy - 7} x2={xScale(row.lower)} y2={yy + 7} /><line x1={xScale(row.upper)} y1={yy - 7} x2={xScale(row.upper)} y2={yy + 7} /></g>}
            {finite(row.difference) && <circle cx={xScale(row.difference)} cy={yy} r="6" fill={color} stroke="#fff" strokeWidth="2" tabIndex={0} aria-label={accessible}><title>{accessible}</title></circle>}
            {!finite(row.difference) && <AxisText x={box.width - box.right - 4} y={yy + 4} value="Not reported" anchor="end" className="sf-missing-label" />}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 12} value={valueLabel} className="sf-axis-title" />
      </svg>
    </div>
    {note && <figcaption className="sf-caption">{note}</figcaption>}
    <DataTable caption="Paired differences and acquisition-family intervals" headers={['Contrast', 'Difference', 'Lower interval bound', 'Upper interval bound', 'Details']} rows={rows.map((row) => [row.label, finite(row.difference) ? nice(row.difference) : 'Not reported', finite(row.lower) ? nice(row.lower) : 'Not reported', finite(row.upper) ? nice(row.upper) : 'Not reported', row.detail ?? ''])} />
  </figure>
}

export function DotIntervalPlot({ rows, valueLabel, domain, targetValue, lowerIsBetter = false, height }: {
  rows: DotIntervalDatum[]
  valueLabel: string
  domain?: [number, number]
  targetValue?: number
  lowerIsBetter?: boolean
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartHeight = height ?? Math.max(240, rows.length * 48 + 95)
  const box = useBox(ref, chartHeight, { wide: [225, 22, 24, 62], narrow: [172, 14, 24, 62] })
  const uid = useId().replace(/:/g, '')
  const limits = domain ?? paddedDomain(rows.flatMap((row) => [row.value ?? undefined, row.lower ?? undefined, row.upper ?? undefined]), { include: finite(targetValue) ? [targetValue] : [], includeZero: false })
  const xScale = chartScale(limits[0], limits[1], box.left, box.plotWidth)
  const rowSpace = box.plotHeight / Math.max(rows.length, 1)
  const axisY = box.height - box.bottom
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Dot and interval comparison', `${valueLabel}. ${lowerIsBetter ? 'Lower values are better.' : ''}${finite(targetValue) ? ` The reference line marks the target value ${nice(targetValue)}.` : ''} Missing values are not plotted.`)}
        {tickValues(limits, 4).map((tick, index) => <g key={index}><line x1={xScale(tick)} y1={box.top} x2={xScale(tick)} y2={axisY} className="sf-grid-line" /><AxisText x={xScale(tick)} y={axisY + 20} value={formatTick(tick)} /></g>)}
        <line className="sf-axis-line" x1={box.left} y1={axisY} x2={box.width - box.right} y2={axisY} />
        {finite(targetValue) && <g><line className="sf-reference-line sf-reference-strong" x1={xScale(targetValue)} y1={box.top} x2={xScale(targetValue)} y2={axisY} /><AxisText x={Math.min(box.width - box.right - 2, xScale(targetValue) + 5)} y={box.top + 13} value={`Target ${nice(targetValue)}`} anchor="start" className="sf-reference-label" /></g>}
        {rows.map((row, index) => {
          const yy = box.top + rowSpace * (index + 0.5)
          const color = colorFor(row.color, index)
          const accessible = `${row.label}: ${finite(row.value) ? `${nice(row.value)} ${valueLabel}` : 'value not reported'}${finite(row.lower) && finite(row.upper) ? `, interval ${nice(row.lower)} to ${nice(row.upper)}` : ''}${row.detail ? `; ${row.detail}` : ''}`
          return <g key={row.id}>
            <AxisText x={box.left - 12} y={yy + 4} value={row.label} anchor="end" className="sf-row-label" />
            {finite(row.value) && finite(row.lower) && finite(row.upper) && <IntervalMark x={xScale(row.value)} y={yy} lower={row.lower} upper={row.upper} xScale={xScale} color={color} />}
            {finite(row.value) && !(finite(row.lower) && finite(row.upper)) && <circle cx={xScale(row.value)} cy={yy} r="5.5" fill={color} stroke="#fff" strokeWidth="1.8" tabIndex={0} aria-label={accessible}><title>{accessible}</title></circle>}
            {!finite(row.value) && <AxisText x={box.width - box.right - 4} y={yy + 4} value="Not reported" anchor="end" className="sf-missing-label" />}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 12} value={valueLabel} className="sf-axis-title" />
      </svg>
    </div>
    {lowerIsBetter && <figcaption className="sf-caption">Lower values are better. Intervals are shown only when both bounds were exported; a missing value remains unplotted.</figcaption>}
    <DataTable caption="Dot and interval values" headers={['Condition', 'Estimate', 'Lower bound', 'Upper bound', 'Details']} rows={rows.map((row) => [row.label, finite(row.value) ? nice(row.value) : 'Not reported', finite(row.lower) ? nice(row.lower) : 'Not reported', finite(row.upper) ? nice(row.upper) : 'Not reported', row.detail ?? ''])} />
  </figure>
}

export function RiskCoveragePlot({ curves, height = 380 }: { curves: RiskCoverageSeries[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [80, 22, 24, 68], narrow: [66, 14, 24, 76] })
  const uid = useId().replace(/:/g, '')
  const valid = curves.flatMap((curve) => curve.points.filter((point) => finite(point.coveragePercent) && point.coveragePercent >= 0 && point.coveragePercent <= 100 && finite(point.riskPercent) && point.riskPercent >= 0))
  const maxRisk = Math.max(1, ...valid.map((point) => point.riskPercent))
  const yDomain: [number, number] = [0, Math.ceil(maxRisk * 1.08 / 5) * 5 || 1]
  const xScale = chartScale(0, 100, box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yDomain[0], yDomain[1], box.height - box.bottom, -box.plotHeight)(value)
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Risk versus accepted-frame coverage', 'Coverage always runs from zero to one hundred percent. Each point is a frozen exported operating point. Connecting lines guide the eye and do not imply frame-level decisions at unreported thresholds.')}
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={[0, 25, 50, 75, 100]} yTicks={tickValues(yDomain, 4)} xFormat={(value) => `${value.toFixed(0)}%`} yFormat={(value) => `${formatTick(value)}%`} />
        {curves.map((curve, index) => {
          const color = colorFor(curve.color, index)
          const points = curve.points.filter((point) => finite(point.coveragePercent) && point.coveragePercent >= 0 && point.coveragePercent <= 100 && finite(point.riskPercent) && point.riskPercent >= 0).sort((a, b) => a.coveragePercent - b.coveragePercent)
          const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${xScale(point.coveragePercent)} ${yScale(point.riskPercent)}`).join(' ')
          return <g key={curve.id} fill={color} stroke={color}>
            {points.length > 1 && <path d={path} fill="none" strokeWidth="2" />}
            {points.map((point, pointIndex) => {
              const denominator = countText(point.retained, point.attempted)
              const accessible = `${curve.label}, point ${pointIndex + 1}: ${percent(point.coveragePercent)} coverage, ${percent(point.riskPercent)} risk${denominator ? `, retained / attempted ${denominator}` : ''}`
              return <circle key={`${curve.id}-${pointIndex}`} cx={xScale(point.coveragePercent)} cy={yScale(point.riskPercent)} r="4.5" stroke="#fff" strokeWidth="1.5" tabIndex={0} aria-label={accessible}><title>{accessible}</title></circle>
            })}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 14} value="Accepted-frame coverage (%)" className="sf-axis-title" />
        <AxisY x={17} y={box.top + box.plotHeight / 2} value="Diameter ARE (%)" />
      </svg>
    </div>
    <figcaption className="sf-caption">Lines connect exported frozen operating points. They do not supply per-frame decisions between those points.</figcaption>
    <ul className="sf-legend">{curves.map((curve, index) => <li key={curve.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(curve.color, index) }} /><span>{curve.label}</span></li>)}</ul>
    <DataTable caption="Frozen risk-coverage points" headers={['Method', 'Coverage (%)', 'Risk (%)', 'Retained / attempted']} rows={curves.flatMap((curve) => curve.points.map((point) => [curve.label, percent(point.coveragePercent), percent(point.riskPercent), countText(point.retained, point.attempted) ?? 'Not reported']))} />
  </figure>
}

function mixColor(start: string, end: string, fraction: number) {
  const a = start.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16)) ?? [238, 245, 242]
  const b = end.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16)) ?? [29, 119, 99]
  const t = Math.max(0, Math.min(1, fraction))
  return `rgb(${a.map((value, index) => Math.round(value + ((b[index] ?? 0) - value) * t)).join(',')})`
}

export function TransformSeverityHeatmap({ rows, metricLabel, valueDomain, palette = ['#eef5f2', '#176b5b'], height, onCellSelect }: {
  rows: TransformSeverityCell[]
  metricLabel: string
  valueDomain?: [number, number]
  palette?: [string, string]
  height?: number
  onCellSelect?: (row: TransformSeverityCell) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const transforms = [...new Set(rows.map((row) => row.transform))]
  const severities = [...new Set(rows.map((row) => String(row.severity)))].sort((a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : a.localeCompare(b))
  const chartHeight = height ?? Math.max(205, transforms.length * 46 + 114)
  const box = useBox(ref, chartHeight, { wide: [162, 18, 79, 25], narrow: [108, 10, 76, 25] })
  const uid = useId().replace(/:/g, '')
  const values = rows.flatMap((row) => finite(row.value) ? [row.value] : [])
  const domain = valueDomain ?? paddedDomain(values, { pad: 0 })
  const cells = new Map(rows.map((row) => [`${row.transform}\u0000${String(row.severity)}`, row]))
  const cellWidth = box.plotWidth / Math.max(severities.length, 1)
  const rowHeight = box.plotHeight / Math.max(transforms.length, 1)
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, `${metricLabel} by operation family and severity`, 'Color intensity encodes the exported estimate. Missing cells are cross-hatched and labelled unavailable; they are not treated as zero.')}
        <defs><pattern id={`${uid}-missing`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#f5f6f4" /><line x1="0" y1="0" x2="0" y2="7" stroke="#c4cdc7" strokeWidth="2" /></pattern></defs>
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 7} value="Transform severity" className="sf-axis-title" />
        {transforms.map((transform, rowIndex) => {
          const y = box.top + rowIndex * rowHeight
          return <g key={transform}>
            <AxisText x={box.left - 10} y={y + rowHeight / 2 + 4} value={transform} anchor="end" className="sf-row-label" />
            {severities.map((severity, colIndex) => {
              const cell = cells.get(`${transform}\u0000${severity}`)
              const x = box.left + colIndex * cellWidth
              const value = finite(cell?.value) ? cell.value : null
              const missing = value === null
              const fraction = value === null || domain[0] === domain[1] ? 0 : (value - domain[0]) / (domain[1] - domain[0])
              const denominator = cell ? countText(cell.accepted, cell.attempted) : null
              const tooltip = cell && finite(cell.value) ? `${transform}, severity ${severity}: ${nice(cell.value)} ${metricLabel}${denominator ? `; accepted / attempted ${denominator}` : ''}${cell.status ? `; ${cell.status}` : ''}` : `${transform}, severity ${severity}: ${cell?.status ?? 'not reported'}`
              return <g key={`${transform}-${severity}`}>
                <rect x={x + 1} y={y + 1} width={Math.max(0, cellWidth - 2)} height={Math.max(0, rowHeight - 2)} fill={missing ? `url(#${uid}-missing)` : mixColor(palette[0], palette[1], fraction)} stroke="#ffffff" strokeWidth="1" role={cell && onCellSelect ? 'button' : undefined} tabIndex={cell && onCellSelect ? 0 : undefined} aria-label={tooltip} onClick={() => { if (cell) onCellSelect?.(cell) }} onKeyDown={(event) => { if (cell && (event.key === 'Enter' || event.key === ' ')) onCellSelect?.(cell) }}><title>{tooltip}</title></rect>
                {cellWidth >= 42 && <AxisText x={x + cellWidth / 2} y={y + rowHeight / 2 + 4} value={value === null ? 'N/A' : nice(value)} className={missing ? 'sf-missing-label' : 'sf-cell-value'} />}
              </g>
            })}
          </g>
        })}
        {severities.map((severity, index) => <text key={severity} x={box.left + index * cellWidth + cellWidth / 2} y={box.top - 8} textAnchor="end" transform={`rotate(-42 ${box.left + index * cellWidth + cellWidth / 2} ${box.top - 8})`} className="sf-heat-severity">{severity}</text>)}
        <g className="sf-color-legend"><rect x={box.left} y={box.top - 52} width="98" height="9" fill={`url(#${uid}-gradient)`} /><text x={box.left} y={box.top - 27}>{formatTick(domain[0])}</text><text x={box.left + 98} y={box.top - 27} textAnchor="end">{formatTick(domain[1])}</text></g>
        <defs><linearGradient id={`${uid}-gradient`}><stop offset="0%" stopColor={palette[0]} /><stop offset="100%" stopColor={palette[1]} /></linearGradient></defs>
      </svg>
    </div>
    <figcaption className="sf-caption">Color shows {metricLabel}. Cross-hatched cells are unavailable, with their reason retained in the values table.</figcaption>
    <DataTable caption={`${metricLabel} by transform and severity`} headers={['Transform', 'Severity', 'Estimate', 'Lower bound', 'Upper bound', 'Accepted / attempted', 'Status']} rows={rows.map((row) => [row.transform, String(row.severity), finite(row.value) ? nice(row.value) : 'Not reported', finite(row.lower) ? nice(row.lower) : 'Not reported', finite(row.upper) ? nice(row.upper) : 'Not reported', countText(row.accepted, row.attempted) ?? 'Not reported', row.status ?? ''])} />
  </figure>
}

export function TransformResponseCurve({ series, xLabel = 'Transform severity', yLabel, targetValue, xDomain, yDomain, height = 370, onPointSelect }: {
  series: TransformResponseSeries[]
  xLabel?: string
  yLabel: string
  targetValue?: number
  xDomain?: [number, number]
  yDomain?: [number, number]
  height?: number
  onPointSelect?: (point: TransformResponsePoint, series: TransformResponseSeries) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [80, 24, 28, 66], narrow: [66, 14, 28, 73] })
  const uid = useId().replace(/:/g, '')
  const all = series.flatMap((entry) => entry.points)
  const xLimits = xDomain ?? paddedDomain(all.map((point) => point.severity), { pad: 0.02 })
  const yLimits = yDomain ?? paddedDomain(all.flatMap((point) => [point.value ?? undefined, point.lower ?? undefined, point.upper ?? undefined]), { include: finite(targetValue) ? [targetValue] : [], pad: 0.08 })
  const xScale = chartScale(xLimits[0], xLimits[1], box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yLimits[0], yLimits[1], box.height - box.bottom, -box.plotHeight)(value)
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Response across transform severity', `Each line joins consecutive exported measurements. Missing measurements break the line. ${finite(targetValue) ? `The horizontal reference marks ${nice(targetValue)}.` : ''}`)}
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={tickValues(xLimits, 4)} yTicks={tickValues(yLimits, 4)} />
        {finite(targetValue) && <g><line className="sf-reference-line sf-reference-strong" x1={box.left} y1={yScale(targetValue)} x2={box.width - box.right} y2={yScale(targetValue)} /><AxisText x={box.width - box.right - 2} y={yScale(targetValue) - 6} value={`Target ${nice(targetValue)}`} anchor="end" className="sf-reference-label" /></g>}
        {series.map((entry, index) => {
          const color = colorFor(entry.color, index)
          const ordered = [...entry.points].sort((a, b) => a.severity - b.severity)
          const segments: TransformResponsePoint[][] = []
          for (const point of ordered) {
            if (!finite(point.value)) { if (segments.at(-1)?.length) segments.push([]); continue }
            if (!segments.length) segments.push([])
            segments.at(-1)!.push(point)
          }
          return <g key={entry.id}>
            {segments.filter((segment) => segment.length > 1).map((segment, segmentIndex) => <path key={segmentIndex} d={segment.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${xScale(point.severity)} ${yScale(point.value!)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" />)}
            {ordered.filter((point) => finite(point.value)).map((point, pointIndex) => {
              const x = xScale(point.severity)
              const y = yScale(point.value!)
              const denominator = countText(point.accepted, point.attempted)
              const label = `${entry.label}, severity ${nice(point.severity)}: ${nice(point.value!)} ${yLabel}${finite(point.lower) && finite(point.upper) ? `, interval ${nice(point.lower)} to ${nice(point.upper)}` : ''}${denominator ? `, accepted / attempted ${denominator}` : ''}${point.caseId ? `, case ${point.caseId}` : ''}`
              return <g key={`${entry.id}-${pointIndex}`}>
                {finite(point.lower) && finite(point.upper) && <g className="sf-vertical-interval" stroke={color}><line x1={x} y1={yScale(point.lower)} x2={x} y2={yScale(point.upper)} /><line x1={x - 4} y1={yScale(point.lower)} x2={x + 4} y2={yScale(point.lower)} /><line x1={x - 4} y1={yScale(point.upper)} x2={x + 4} y2={yScale(point.upper)} /></g>}
                <circle className={onPointSelect && point.caseId ? 'sf-clickable-point' : undefined} cx={x} cy={y} r="4.8" fill={color} stroke="#fff" strokeWidth="1.5" tabIndex={onPointSelect && point.caseId ? 0 : undefined} aria-label={label} onClick={() => point.caseId && onPointSelect?.(point, entry)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && point.caseId) onPointSelect?.(point, entry) }}><title>{label}</title></circle>
              </g>
            })}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 14} value={xLabel} className="sf-axis-title" />
        <AxisY x={17} y={box.top + box.plotHeight / 2} value={yLabel} />
      </svg>
    </div>
    <ul className="sf-legend">{series.map((entry, index) => <li key={entry.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(entry.color, index) }} /><span>{entry.label}</span></li>)}</ul>
    {onPointSelect && <p className="sf-caption">Select a response point to open evidence for the exact exported case.</p>}
    <DataTable caption="Transform response measurements" headers={['Series', 'Severity', 'Estimate', 'Lower bound', 'Upper bound', 'Accepted / attempted', 'Case']} rows={series.flatMap((entry) => entry.points.map((point) => [entry.label, nice(point.severity), finite(point.value) ? nice(point.value) : 'Not reported', finite(point.lower) ? nice(point.lower) : 'Not reported', finite(point.upper) ? nice(point.upper) : 'Not reported', countText(point.accepted, point.attempted) ?? 'Not reported', point.caseId ?? '']))} />
  </figure>
}

export function TemporalRmseGainScatter({ points, xMetricLabel = 'Diameter / center RMSE', height = 380 }: {
  points: TemporalRmseGainDatum[]
  xMetricLabel?: string
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [88, 22, 27, 66], narrow: [74, 14, 27, 72] })
  const uid = useId().replace(/:/g, '')
  const xDomain = paddedDomain(points.map((point) => point.rmse), { includeZero: true, pad: 0.08 })
  const yDomain = paddedDomain(points.map((point) => point.gain), { include: [1], pad: 0.09 })
  const xScale = chartScale(xDomain[0], xDomain[1], box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yDomain[0], yDomain[1], box.height - box.bottom, -box.plotHeight)(value)
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Temporal error versus three hertz gain', 'The vertical reference at gain one marks no attenuation or amplification. Lower error is better, while gain closer to one is more faithful. Circle area encodes accepted-frame coverage when available.')}
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={tickValues(xDomain, 4)} yTicks={tickValues(yDomain, 4)} />
        <g><line className="sf-reference-line sf-reference-strong" x1={box.left} y1={yScale(1)} x2={box.width - box.right} y2={yScale(1)} /><AxisText x={box.width - box.right - 3} y={yScale(1) - 6} value="Gain = 1" anchor="end" className="sf-reference-label" /></g>
        {points.map((point, index) => {
          const color = colorFor(point.color, index)
          const radius = finite(point.coveragePercent) ? 4 + Math.max(0, Math.min(100, point.coveragePercent)) / 100 * 4 : 5
          const accessible = `${point.label}: RMSE ${nice(point.rmse)}, 3-Hz gain ${nice(point.gain)}${finite(point.coveragePercent) ? `, coverage ${percent(point.coveragePercent)}` : ''}${point.seed !== undefined ? `, seed ${point.seed}` : ''}`
          return <circle key={point.id} cx={xScale(point.rmse)} cy={yScale(point.gain)} r={radius} fill={color} fillOpacity=".86" stroke="#ffffff" strokeWidth="2" tabIndex={0} aria-label={accessible}><title>{accessible}</title></circle>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 14} value={xMetricLabel} className="sf-axis-title" />
        <AxisY x={17} y={box.top + box.plotHeight / 2} value="3-Hz gain" />
      </svg>
    </div>
    <figcaption className="sf-caption">Low error can coexist with attenuated responses. The dashed line marks the ideal gain of 1; circle area represents coverage from 0 to 100% when that value is available.</figcaption>
    <ul className="sf-legend">{points.map((point, index) => <li key={point.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(point.color, index) }} /><span>{point.label}{point.seed !== undefined ? <small>Seed {point.seed}</small> : null}</span></li>)}</ul>
    <DataTable caption="Temporal error and gain points" headers={['Condition / seed', 'RMSE', '3-Hz gain', 'Coverage (%)']} rows={points.map((point) => [point.label, nice(point.rmse), nice(point.gain), finite(point.coveragePercent) ? percent(point.coveragePercent) : 'Not reported'])} />
  </figure>
}

export function FrequencyResponsePlot({ series, mode, height = 360, targetValue }: {
  series: FrequencyResponseSeries[]
  mode: 'gain' | 'phase'
  height?: number
  targetValue?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [85, 22, 28, 65], narrow: [69, 14, 28, 72] })
  const uid = useId().replace(/:/g, '')
  const property = mode === 'gain' ? 'gain' : 'phaseLagMs'
  const target = finite(targetValue) ? targetValue : mode === 'gain' ? 1 : 0
  const points = series.flatMap((entry) => entry.points)
  const xDomain = paddedDomain(points.map((point) => point.frequencyHz), { includeZero: true, pad: 0.02 })
  const yDomain = paddedDomain(points.map((point) => point[property] ?? undefined), { include: [target], pad: 0.09 })
  const xScale = chartScale(xDomain[0], xDomain[1], box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yDomain[0], yDomain[1], box.height - box.bottom, -box.plotHeight)(value)
  const yLabel = mode === 'gain' ? 'Response gain' : 'Phase lag (ms)'
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, `Frequency response: ${mode}`, `${mode === 'gain' ? 'The reference line marks ideal unit gain.' : 'The reference line marks zero phase lag.'} Lines join observed exported frequencies; missing observations are omitted without interpolation.`)}
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={tickValues(xDomain, 4)} yTicks={tickValues(yDomain, 4)} xFormat={(value) => `${formatTick(value)} Hz`} />
        <g><line className="sf-reference-line sf-reference-strong" x1={box.left} y1={yScale(target)} x2={box.width - box.right} y2={yScale(target)} /><AxisText x={box.width - box.right - 2} y={yScale(target) - 6} value={mode === 'gain' ? 'Ideal = 1' : 'Ideal = 0'} anchor="end" className="sf-reference-label" /></g>
        {series.map((entry, index) => {
          const color = colorFor(entry.color, index)
          const ordered = [...entry.points].sort((a, b) => a.frequencyHz - b.frequencyHz)
          const segments: FrequencyResponsePoint[][] = []
          for (const point of ordered) {
            if (!finite(point[property])) { if (segments.at(-1)?.length) segments.push([]); continue }
            if (!segments.length) segments.push([])
            segments.at(-1)!.push(point)
          }
          return <g key={entry.id}>
            {segments.filter((segment) => segment.length > 1).map((segment, segmentIndex) => <path key={segmentIndex} d={segment.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${xScale(point.frequencyHz)} ${yScale(point[property]!)} `).join(' ')} fill="none" stroke={color} strokeWidth="2" />)}
            {ordered.filter((point) => finite(point[property])).map((point, pointIndex) => {
              const value = point[property]!
              const accessible = `${entry.label} at ${nice(point.frequencyHz)} Hz: ${nice(value)} ${mode === 'gain' ? 'gain' : 'ms phase lag'}${finite(point.coveragePercent) ? `; coverage ${percent(point.coveragePercent)}` : ''}`
              return <circle key={`${entry.id}-${pointIndex}`} cx={xScale(point.frequencyHz)} cy={yScale(value)} r="4.7" fill={color} stroke="#fff" strokeWidth="1.5" tabIndex={0} aria-label={accessible}><title>{accessible}</title></circle>
            })}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 13} value="Stimulus frequency (Hz)" className="sf-axis-title" />
        <AxisY x={16} y={box.top + box.plotHeight / 2} value={yLabel} />
      </svg>
    </div>
    <ul className="sf-legend">{series.map((entry, index) => <li key={entry.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(entry.color, index) }} /><span>{entry.label}</span></li>)}</ul>
    <DataTable caption={`Frequency response (${mode})`} headers={['Condition', 'Frequency (Hz)', mode === 'gain' ? 'Gain' : 'Phase lag (ms)', 'Coverage (%)']} rows={series.flatMap((entry) => entry.points.map((point) => [entry.label, nice(point.frequencyHz), finite(point[property]) ? nice(point[property]!) : 'Not reported', finite(point.coveragePercent) ? percent(point.coveragePercent) : 'Not reported']))} />
  </figure>
}

export function StepResponsePlot({ series, height = 470 }: { series: StepResponseSeries[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [82, 24, 28, 62], narrow: [68, 14, 28, 62] })
  const uid = useId().replace(/:/g, '')
  const allPoints = series.flatMap((entry) => entry.points)
  const xDomain = paddedDomain(allPoints.map((point) => point.timeMs), { includeZero: true, pad: 0.02 })
  const primaryValues = allPoints.flatMap((point) => [point.gt ?? undefined, point.prediction ?? undefined])
  const residualValues = allPoints.flatMap((point) => point.residual ?? undefined)
  const primaryDomain = paddedDomain(primaryValues, { includeZero: true, pad: 0.08 })
  const residualDomain = symmetricDomain(residualValues)
  const xScale = chartScale(xDomain[0], xDomain[1], box.left, box.plotWidth)
  const panelGap = 38
  const panelTop = box.top
  const panelHeight = Math.max(35, (box.plotHeight - panelGap) * 0.65)
  const residualTop = panelTop + panelHeight + panelGap
  const residualHeight = Math.max(35, box.plotHeight - panelHeight - panelGap)
  const yPrimary = (value: number) => chartScale(primaryDomain[0], primaryDomain[1], panelTop + panelHeight, -panelHeight)(value)
  const yResidual = (value: number) => chartScale(residualDomain[0], residualDomain[1], residualTop + residualHeight, -residualHeight)(value)
  const pathFor = (points: StepResponsePoint[], getter: (point: StepResponsePoint) => number | null | undefined, y: (value: number) => number) => {
    const segments: StepResponsePoint[][] = []
    for (const point of [...points].sort((a, b) => a.timeMs - b.timeMs)) {
      if (!finite(getter(point))) { if (segments.at(-1)?.length) segments.push([]); continue }
      if (!segments.length) segments.push([])
      segments.at(-1)!.push(point)
    }
    return segments.filter((segment) => segment.length > 1).map((segment) => segment.map((point, index) => `${index ? 'L' : 'M'} ${xScale(point.timeMs)} ${y(getter(point)!)} `).join(' '))
  }
  return <figure className="scientific-figure">
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, 'Step response and residual traces', 'The upper panel compares exported ground truth and predictions over time. The lower panel shows only exported residuals around a zero reference; missing residuals are not filled with zero.')}
        {tickValues(xDomain, 4).map((tick, index) => <g key={`x-${index}`}><line className="sf-grid-line" x1={xScale(tick)} y1={panelTop} x2={xScale(tick)} y2={residualTop + residualHeight} /><AxisText x={xScale(tick)} y={box.height - 13} value={formatTick(tick)} /></g>)}
        {tickValues(primaryDomain, 3).map((tick, index) => <g key={`p-${index}`}><line className="sf-grid-line" x1={box.left} y1={yPrimary(tick)} x2={box.width - box.right} y2={yPrimary(tick)} /><AxisText x={box.left - 9} y={yPrimary(tick) + 4} value={formatTick(tick)} anchor="end" /></g>)}
        {tickValues(residualDomain, 2).map((tick, index) => <g key={`r-${index}`}><line className={Math.abs(tick) < 1e-9 ? 'sf-reference-line sf-reference-strong' : 'sf-grid-line'} x1={box.left} y1={yResidual(tick)} x2={box.width - box.right} y2={yResidual(tick)} /><AxisText x={box.left - 9} y={yResidual(tick) + 4} value={formatTick(tick)} anchor="end" /></g>)}
        <text x={box.left + 4} y={panelTop + 15} className="sf-panel-label">Ground truth and prediction</text>
        <text x={box.left + 4} y={residualTop + 15} className="sf-panel-label">Residual (zero reference)</text>
        {series.map((entry, index) => <g key={entry.id}>
          {pathFor(entry.points, (point) => point.gt, yPrimary).map((path, pathIndex) => <path key={`gt-${pathIndex}`} d={path} fill="none" stroke="#202d31" strokeWidth="2.4" />)}
          {pathFor(entry.points, (point) => point.prediction, yPrimary).map((path, pathIndex) => <path key={`pred-${pathIndex}`} d={path} fill="none" stroke={colorFor(entry.color, index)} strokeWidth="2" />)}
          {pathFor(entry.points, (point) => point.residual, yResidual).map((path, pathIndex) => <path key={`residual-${pathIndex}`} d={path} fill="none" stroke={colorFor(entry.color, index)} strokeWidth="1.8" />)}
        </g>)}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 1} value="Time (ms)" className="sf-axis-title" />
        <AxisY x={16} y={panelTop + panelHeight / 2} value="Diameter" />
        <AxisY x={16} y={residualTop + residualHeight / 2} value="Residual" />
      </svg>
    </div>
    <ul className="sf-legend"><li><span className="sf-swatch sf-swatch-gt" /><span>Ground truth</span></li>{series.map((entry, index) => <li key={entry.id}><span className="sf-swatch" style={{ backgroundColor: colorFor(entry.color, index) }} /><span>{entry.label}</span></li>)}</ul>
    <DataTable caption="Step-response measurements" headers={['Condition', 'Time (ms)', 'Ground truth', 'Prediction', 'Residual']} rows={series.flatMap((entry) => entry.points.map((point) => [entry.label, nice(point.timeMs), finite(point.gt) ? nice(point.gt) : 'Not reported', finite(point.prediction) ? nice(point.prediction) : 'Not reported', finite(point.residual) ? nice(point.residual) : 'Not reported']))} />
  </figure>
}

export function RuntimeIntervalPlot({ rows, timing, protocol, height }: {
  rows: RuntimeIntervalDatum[]
  timing: 'endToEnd' | 'modelOnly'
  protocol: string
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartHeight = height ?? Math.max(250, rows.length * 46 + 105)
  const box = useBox(ref, chartHeight, { wide: [224, 22, 26, 64], narrow: [168, 14, 26, 65] })
  const uid = useId().replace(/:/g, '')
  const p50 = (row: RuntimeIntervalDatum) => timing === 'endToEnd' ? row.endToEndP50Ms : row.modelOnlyP50Ms
  const p95 = (row: RuntimeIntervalDatum) => timing === 'endToEnd' ? row.endToEndP95Ms : row.modelOnlyP95Ms
  const max = Math.max(1, ...rows.flatMap((row) => [p50(row), p95(row)].filter(finite)))
  const domain: [number, number] = [0, Math.ceil(max * 1.08 / 5) * 5 || max * 1.08]
  const xScale = chartScale(domain[0], domain[1], box.left, box.plotWidth)
  const rowSpace = box.plotHeight / Math.max(rows.length, 1)
  const axisY = box.height - box.bottom
  return <figure className="scientific-figure">
    <p className="sf-protocol">{protocol}</p>
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, `${timing === 'endToEnd' ? 'End-to-end' : 'Model-only'} runtime p50 and p95`, 'Dots show measured runtime percentiles in milliseconds. A connector between p50 and p95 is a quantile span, not a confidence interval.')}
        {tickValues(domain, 4).map((tick, index) => <g key={index}><line className="sf-grid-line" x1={xScale(tick)} y1={box.top} x2={xScale(tick)} y2={axisY} /><AxisText x={xScale(tick)} y={axisY + 20} value={formatTick(tick)} /></g>)}
        <line className="sf-axis-line" x1={box.left} y1={axisY} x2={box.width - box.right} y2={axisY} />
        {rows.map((row, index) => {
          const yy = box.top + rowSpace * (index + 0.5)
          const color = colorFor(row.color, index)
          const median = p50(row)
          const percentile = p95(row)
          const accessible = `${row.label}: p50 ${finite(median) ? `${nice(median)} ms` : 'not reported'}, p95 ${finite(percentile) ? `${nice(percentile)} ms` : 'not reported'}${row.detail ? `; ${row.detail}` : ''}`
          return <g key={row.id}>
            <AxisText x={box.left - 12} y={yy + 4} value={row.label} anchor="end" className="sf-row-label" />
            {finite(median) && finite(percentile) && <line x1={xScale(median)} y1={yy} x2={xScale(percentile)} y2={yy} stroke={color} strokeWidth="2" />}
            {finite(median) && <circle cx={xScale(median)} cy={yy} r="5.5" fill={color} stroke="#fff" strokeWidth="1.5" tabIndex={0} aria-label={`${accessible}; filled circle is p50`}><title>{accessible}; filled circle is p50</title></circle>}
            {finite(percentile) && <rect x={xScale(percentile) - 4.5} y={yy - 4.5} width="9" height="9" rx="1" fill="#fff" stroke={color} strokeWidth="2" tabIndex={0} aria-label={`${accessible}; open square is p95`}><title>{accessible}; open square is p95</title></rect>}
            {!finite(median) && !finite(percentile) && <AxisText x={box.width - box.right - 4} y={yy + 4} value="Not reported" anchor="end" className="sf-missing-label" />}
          </g>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 12} value="Runtime (ms)" className="sf-axis-title" />
      </svg>
    </div>
    <div className="sf-key"><span><i className="sf-key-p50" />p50</span><span><i className="sf-key-p95" />p95</span></div>
    <figcaption className="sf-caption">Filled circles show p50; open squares show p95. The connecting span describes the measured quantiles and is not an inferential confidence interval.</figcaption>
    <DataTable caption={`${timing === 'endToEnd' ? 'End-to-end' : 'Model-only'} runtime values`} headers={['Method', 'p50 (ms)', 'p95 (ms)', 'Details']} rows={rows.map((row) => [row.label, finite(p50(row)) ? nice(p50(row)!) : 'Not reported', finite(p95(row)) ? nice(p95(row)!) : 'Not reported', row.detail ?? ''])} />
  </figure>
}

export function TradeoffScatter({ points, xLabel, yLabel, xDirection, yDirection, xTarget, yTarget, xThreshold, yThreshold, xThresholdLabel, yThresholdLabel, coverageThresholdPercent, showFrontier = true, xDomain, yDomain, height = 390, onPointClick }: TradeoffScatterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref, height, { wide: [87, 23, 28, 72], narrow: [73, 14, 28, 78] })
  const uid = useId().replace(/:/g, '')
  const [coverageMode, setCoverageMode] = useState<'all' | 'threshold'>('all')
  const available = points.filter((point) => finite(point.x) && finite(point.y))
  const visible = available.filter((point) => coverageMode === 'all' || (finite(coverageThresholdPercent) && finite(point.coveragePercent) && point.coveragePercent >= coverageThresholdPercent))
  const xLimits = xDomain ?? paddedDomain(available.flatMap((point) => [point.x, ...(finite(xTarget) ? [xTarget] : []), ...(finite(xThreshold) ? [xThreshold] : [])]))
  const yLimits = yDomain ?? paddedDomain(available.flatMap((point) => [point.y, ...(finite(yTarget) ? [yTarget] : []), ...(finite(yThreshold) ? [yThreshold] : [])]))
  const xScale = chartScale(xLimits[0], xLimits[1], box.left, box.plotWidth)
  const yScale = (value: number) => chartScale(yLimits[0], yLimits[1], box.height - box.bottom, -box.plotHeight)(value)

  const groups = new Map<string, TradeoffDatum[]>()
  for (const point of visible) {
    if (point.comparable === false) continue
    const group = point.comparisonGroup ?? 'Comparable conditions'
    groups.set(group, [...(groups.get(group) ?? []), point])
  }
  const axisCost = (value: number, direction: TradeoffDirection, target: number | undefined) => direction === 'higher'
    ? -value
    : direction === 'target'
      ? Math.abs(value - target!)
      : value
  const frontierByGroup = [...groups.entries()].map(([group, members]) => {
    const frontier = members.filter((point) => !members.some((other) => {
      if (other.id === point.id) return false
      const pointXCost = axisCost(point.x!, xDirection, xTarget)
      const pointYCost = axisCost(point.y!, yDirection, yTarget)
      const otherXCost = axisCost(other.x!, xDirection, xTarget)
      const otherYCost = axisCost(other.y!, yDirection, yTarget)
      const xNoWorse = otherXCost <= pointXCost
      const yNoWorse = otherYCost <= pointYCost
      const strictlyBetter = otherXCost < pointXCost
      const alsoStrictlyBetter = otherYCost < pointYCost
      return xNoWorse && yNoWorse && (strictlyBetter || alsoStrictlyBetter)
    })).sort((a, b) => a.x! - b.x!)
    return { group, frontier }
  })
  const meetsThreshold = (point: TradeoffDatum) => (!finite(xThreshold) || (xDirection === 'lower' ? point.x! <= xThreshold : point.x! >= xThreshold))
    && (!finite(yThreshold) || (yDirection === 'lower' ? point.y! <= yThreshold : point.y! >= yThreshold))
  const describePoint = (point: TradeoffDatum) => {
    const metadata = Object.entries(point.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => `${key}: ${String(value)}`).join('; ')
    return `${point.label}: ${nice(point.x!)} ${xLabel}; ${nice(point.y!)} ${yLabel}${finite(point.coveragePercent) ? `; ${percent(point.coveragePercent)} coverage` : ''}${point.status ? `; ${point.status}` : ''}${metadata ? `; ${metadata}` : ''}`
  }
  const preference = (direction: TradeoffDirection, axis: string, target: number | undefined) => direction === 'target'
    ? `${axis} closest to target ${nice(target!)}`
    : direction === 'lower'
      ? `lower ${axis}`
      : `higher ${axis}`

  return <figure className="scientific-figure sf-tradeoff-figure">
    {finite(coverageThresholdPercent) && <div className="sf-tradeoff-controls"><label>Coverage filter<select value={coverageMode} onChange={(event) => setCoverageMode(event.target.value as 'all' | 'threshold')}><option value="all">All comparable points</option><option value="threshold">At least {nice(coverageThresholdPercent)}% coverage</option></select></label><span>{coverageMode === 'threshold' ? `${visible.length} plotted point${visible.length === 1 ? '' : 's'} meet the coverage filter.` : `${visible.length} plotted point${visible.length === 1 ? '' : 's'}.`}</span></div>}
    <div className="sf-chart-slot" ref={ref}>
      <svg className="sf-chart" viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`}>
        {svgMeta(uid, `${xLabel} versus ${yLabel}`, `Pareto frontier is calculated among comparable conditions in the same group. Preferred values are ${preference(xDirection, xLabel.toLowerCase(), xTarget)} and ${preference(yDirection, yLabel.toLowerCase(), yTarget)}. Coverage filter is separate from the plotted axes.`)}
        <AxisGrid box={box} xScale={xScale} yScale={yScale} xTicks={tickValues(xLimits, 4)} yTicks={tickValues(yLimits, 4)} />
        {finite(xTarget) && <g><line className="sf-reference-line sf-reference-strong" x1={xScale(xTarget)} y1={box.top} x2={xScale(xTarget)} y2={box.height - box.bottom} /><AxisText x={Math.min(box.width - box.right - 3, xScale(xTarget) + 5)} y={box.height - box.bottom - 8} value={`Target ${nice(xTarget)}`} anchor="start" className="sf-reference-label" /></g>}
        {finite(yTarget) && <g><line className="sf-reference-line sf-reference-strong" x1={box.left} y1={yScale(yTarget)} x2={box.width - box.right} y2={yScale(yTarget)} /><AxisText x={box.width - box.right - 3} y={yScale(yTarget) - 6} value={`Target ${nice(yTarget)}`} anchor="end" className="sf-reference-label" /></g>}
        {finite(xThreshold) && <g><line className="sf-threshold-line" x1={xScale(xThreshold)} y1={box.top} x2={xScale(xThreshold)} y2={box.height - box.bottom} /><AxisText x={Math.min(box.width - box.right - 3, xScale(xThreshold) + 5)} y={box.height - box.bottom - 8} value={xThresholdLabel ?? `Gate ${nice(xThreshold)}`} anchor="start" className="sf-reference-label" /></g>}
        {finite(yThreshold) && <g><line className="sf-threshold-line" x1={box.left} y1={yScale(yThreshold)} x2={box.width - box.right} y2={yScale(yThreshold)} /><AxisText x={box.width - box.right - 3} y={yScale(yThreshold) - 6} value={yThresholdLabel ?? `Gate ${nice(yThreshold)}`} anchor="end" className="sf-reference-label" /></g>}
        {showFrontier && frontierByGroup.map(({ group, frontier }) => frontier.length > 1 && <path key={group} d={frontier.map((point, index) => `${index ? 'L' : 'M'} ${xScale(point.x!)} ${yScale(point.y!)} `).join(' ')} className="sf-frontier-line" />)}
        {visible.map((point, index) => {
          const color = colorFor(point.color, index)
          const isFrontier = frontierByGroup.some(({ frontier }) => frontier.some((entry) => entry.id === point.id))
          const passes = meetsThreshold(point)
          const targetText = [xDirection === 'target' ? `x target ${nice(xTarget!)}` : '', yDirection === 'target' ? `y target ${nice(yTarget!)}` : ''].filter(Boolean).join(', ')
          const aria = `${describePoint(point)}${targetText ? `; ${targetText}` : ''}${point.comparable === false ? '; excluded from frontier because the points are not comparable' : isFrontier ? '; Pareto non-dominated within its comparison group' : '; dominated within its comparison group'}${passes ? '; passes plotted thresholds' : '; outside one or more plotted thresholds'}`
          return <circle key={point.id} className={`${onPointClick ? 'sf-clickable-point' : ''} ${isFrontier ? 'sf-frontier-point' : ''} ${passes ? '' : 'sf-fails-threshold'}`} cx={xScale(point.x!)} cy={yScale(point.y!)} r={isFrontier ? 6 : 4.7} fill={color} stroke={isFrontier ? '#122b2a' : '#ffffff'} strokeWidth={isFrontier ? 2 : 1.8} tabIndex={onPointClick ? 0 : undefined} aria-label={aria} onClick={() => onPointClick?.(point)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && onPointClick) onPointClick(point) }}><title>{aria}</title></circle>
        })}
        <AxisText x={box.left + box.plotWidth / 2} y={box.height - 14} value={xLabel} className="sf-axis-title" />
        <AxisY x={16} y={box.top + box.plotHeight / 2} value={yLabel} />
      </svg>
    </div>
    {showFrontier && <figcaption className="sf-caption">The solid frontier joins non-dominated points within each comparable group. A status or threshold failure does not remove an observation from the full-data view.</figcaption>}
    <DataTable caption="Trade-off observations" headers={['Condition', xLabel, yLabel, 'Coverage (%)', 'Status', 'Metadata']} rows={points.map((point) => [point.label, finite(point.x) ? nice(point.x) : 'Not reported', finite(point.y) ? nice(point.y) : 'Not reported', finite(point.coveragePercent) ? percent(point.coveragePercent) : 'Not reported', point.status ?? '', Object.entries(point.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => `${key}: ${String(value)}`).join('; ')])} />
  </figure>
}

export function DeploymentFrontierScatter({ points, view = 'latency-accuracy', coverageThresholdPercent = 95, onPointClick, height = 370 }: {
  points: DeploymentFrontierDatum[]
  view?: 'latency-accuracy' | 'latency-coverage'
  coverageThresholdPercent?: number
  onPointClick?: (point: DeploymentFrontierDatum) => void
  height?: number
}) {
  const tradeoffPoints: TradeoffDatum[] = points.map((point) => ({
    id: point.id,
    label: point.label,
    x: point.latencyMs,
    y: view === 'latency-accuracy' ? point.diameterArePercent ?? null : point.coveragePercent ?? null,
    coveragePercent: point.coveragePercent,
    color: point.color,
    status: point.status,
    metadata: point.metadata,
  }))
  const maximumLatency = Math.max(1, ...points.map((point) => finite(point.latencyMs) ? point.latencyMs! : 0))
  const maximumError = Math.max(1, ...points.map((point) => finite(point.diameterArePercent) ? point.diameterArePercent! : 0))
  return <TradeoffScatter
    points={tradeoffPoints}
    xLabel="End-to-end latency p50 (ms)"
    yLabel={view === 'latency-accuracy' ? 'Family-macro diameter ARE (%)' : 'Accepted-frame coverage (%)'}
    xDirection="lower"
    yDirection={view === 'latency-accuracy' ? 'lower' : 'higher'}
    xDomain={[0, Math.ceil(maximumLatency * 1.1 / 5) * 5]}
    yDomain={view === 'latency-accuracy' ? [0, Math.ceil(maximumError * 1.1 / 5) * 5] : [0, 100]}
    yThreshold={view === 'latency-coverage' ? 95 : undefined}
    yThresholdLabel={view === 'latency-coverage' ? '≥95% coverage gate' : undefined}
    coverageThresholdPercent={coverageThresholdPercent}
    height={height}
    onPointClick={onPointClick ? (point) => { const source = points.find((entry) => entry.id === point.id); if (source) onPointClick(source) } : undefined}
  />
}

const showValue = (value: number | null | undefined, digits = 2, suffix = '') => finite(value) ? `${nice(value, digits)}${suffix}` : 'Not reported'
const gateDescription: Record<CoverageGateStatus, string> = {
  pass: 'Executed · coverage gate passed',
  fail: 'Executed · coverage gate failed',
  'executed-failed': 'Executed · coverage gate failed',
  'not-run': 'Not run',
  unavailable: 'Unavailable',
  unknown: 'Gate status not reported',
}

export function DeploymentMatrix({ rows }: { rows: DeploymentMatrixRow[] }) {
  const cells = (row: DeploymentMatrixRow) => [
    ['Model-only p50', showValue(row.modelOnlyP50Ms, 3, ' ms')],
    ['End-to-end p50', showValue(row.endToEndP50Ms, 3, ' ms')],
    ['Coverage', showValue(row.coveragePercent, 2, '%')],
    ['Family-macro diameter ARE', showValue(row.diameterArePercent, 3, '%')],
    ['ARE difference vs PyTorch FP32', showValue(row.accuracyDeltaPp, 3, ' pp')],
    ['VRAM', showValue(row.vramMb, 0, ' MB')],
    ['Engine / model size', showValue(row.modelSizeMb, 1, ' MB')],
    ['Coverage gate', row.gateLabel ?? gateDescription[row.gateStatus]],
  ]
  return <section className="sf-deployment-matrix" aria-label="Deployment condition matrix">
    <div className="sf-deployment-desktop">
      <table>
        <caption>Deployment variants by model, backend, and precision</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Backend</th><th scope="col">Precision</th><th scope="col">Model-only p50</th><th scope="col">End-to-end p50</th><th scope="col">Coverage</th><th scope="col">Diameter ARE (%)</th><th scope="col">ARE Δ vs FP32 (pp)</th><th scope="col">VRAM (MB)</th><th scope="col">Model size (MB)</th><th scope="col">≥95% coverage gate</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <th scope="row">{row.model}</th><td>{row.backend}</td><td>{row.precision}</td>
          <td>{showValue(row.modelOnlyP50Ms, 3)}</td><td className="sf-emphasis-cell">{showValue(row.endToEndP50Ms, 3)}</td><td>{showValue(row.coveragePercent, 2, '%')}</td><td>{showValue(row.diameterArePercent, 3)}</td><td>{showValue(row.accuracyDeltaPp, 3)}</td><td>{showValue(row.vramMb, 0)}</td><td>{showValue(row.modelSizeMb, 1)}</td>
          <td><span className={`sf-gate sf-gate-${row.gateStatus}`}>{row.gateLabel ?? gateDescription[row.gateStatus]}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="sf-deployment-mobile">{rows.map((row) => <article className="sf-deployment-card" key={row.id}>
      <h3>{row.model} <span>{row.backend} · {row.precision}</span></h3>
      <dl>{cells(row).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === 'Coverage gate' ? <span className={`sf-gate sf-gate-${row.gateStatus}`}>{value}</span> : value}</dd></div>)}</dl>
      {row.detail && <p>{row.detail}</p>}
    </article>)}</div>
    <p className="sf-caption">End-to-end latency is the practical measurement time. ARE differences subtract each model's PyTorch FP32 conditional estimate; accepted frame sets can differ. A failed coverage gate means the executed condition did not reach the required accepted-frame coverage.</p>
  </section>
}
