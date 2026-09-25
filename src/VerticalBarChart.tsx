import type { KeyboardEvent } from 'react'
import { methodColor } from './palette'
import './VerticalBarChart.css'

export interface VerticalBarDatum {
  id: string
  label: string
  value: number | null
  color?: string
  family?: string
  lower?: number | null
  upper?: number | null
  coveragePercent?: number | null
  detail?: string
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function format(value: number, digits = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)
}

export default function VerticalBarChart({
  rows,
  valueLabel,
  domain,
  lowerIsBetter = false,
  referenceLine,
  coverageAnnotation = false,
  onBarClick,
  valueDigits = 2,
  intervalLabel,
  capAbove = false,
}: {
  rows: VerticalBarDatum[]
  valueLabel: string
  domain: [number, number]
  lowerIsBetter?: boolean
  referenceLine?: { value: number; label: string }
  coverageAnnotation?: boolean
  onBarClick?: (row: VerticalBarDatum) => void
  valueDigits?: number
  intervalLabel?: string
  capAbove?: boolean
}) {
  const slot = rows.length > 8 ? 88 : 124
  const left = 62
  const right = 18
  const top = 52
  const axisY = 236
  const plotHeight = axisY - top
  const width = Math.max(760, left + right + slot * rows.length)
  const height = 340
  const y = (value: number) => axisY - ((value - domain[0]) / (domain[1] - domain[0] || 1)) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, index) => domain[0] + (domain[1] - domain[0]) * index / 4)
  const tickDigits = valueDigits >= 4 || domain[1] < 1 ? Math.max(2, Math.min(5, valueDigits)) : domain[1] < 10 ? 2 : 1
  const onKeyDown = (event: KeyboardEvent<SVGRectElement>, row: VerticalBarDatum) => {
    if ((event.key === 'Enter' || event.key === ' ') && onBarClick) {
      event.preventDefault()
      onBarClick(row)
    }
  }

  return <figure className="vertical-bar-figure">
    <div className="vertical-bar-toolbar"><b>{lowerIsBetter ? 'LOWER IS BETTER ↓' : 'HIGHER IS BETTER ↑'}</b><span>Exact values shown above bars{rows.some((row) => finite(row.lower) && finite(row.upper)) ? ` · ${intervalLabel ?? 'intervals shown where exported'}` : ''}</span></div>
    <div className="vertical-bar-scroll" role="region" aria-label={`${valueLabel} vertical bar chart`} tabIndex={0}>
      <svg className="vertical-bar-chart" role="img" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} aria-label={`${valueLabel} by method`}>
        <title>{valueLabel} by method. {lowerIsBetter ? 'Lower values are better.' : 'Higher values are better.'}</title>
        <text className="vb-axis-title" x="18" y={top + plotHeight / 2} transform={`rotate(-90 18 ${top + plotHeight / 2})`} textAnchor="middle">{valueLabel}</text>
        {ticks.map((tick, index) => {
          const yy = y(tick)
          return <g key={index}>
            <line className="vb-gridline" x1={left} x2={width - right} y1={yy} y2={yy} />
            <text className="vb-tick" x={left - 10} y={yy + 4} textAnchor="end">{format(tick, tickDigits)}</text>
          </g>
        })}
        {referenceLine && referenceLine.value >= domain[0] && referenceLine.value <= domain[1] && <g>
          <line className="vb-reference-line" x1={left} x2={width - right} y1={y(referenceLine.value)} y2={y(referenceLine.value)} />
          <text className="vb-reference-label" x={width - right - 2} y={y(referenceLine.value) - 6} textAnchor="end">{referenceLine.label}</text>
        </g>}
        <line className="vb-axis-line" x1={left} x2={width - right} y1={axisY} y2={axisY} />
        {rows.map((row, index) => {
          const center = left + index * slot + slot / 2
          const color = row.color ?? methodColor(row.id, row.family)
          const labelTop = axisY + 8
          const coverage = finite(row.coveragePercent) ? row.coveragePercent : undefined
          const lowCoverage = coverage !== undefined && coverage < 90
          const exactValue = finite(row.value) ? `${format(row.value, valueDigits)}${valueLabel.includes('(%)') ? '%' : ''}` : 'NOT MEASURED'
          const interval = finite(row.lower) && finite(row.upper)
          const aria = `${row.label}: ${finite(row.value) ? `${format(row.value, valueDigits)} ${valueLabel}` : 'not measured'}${coverage !== undefined ? `; coverage ${format(coverage)}%${lowCoverage ? ', low coverage' : ''}` : ''}${interval ? `; interval ${format(row.lower!)} to ${format(row.upper!)}` : ''}${row.detail ? `; ${row.detail}` : ''}`
          if (!finite(row.value)) return <g key={row.id}>
            <text className="vb-missing" x={center} y={axisY - 12} textAnchor="middle">NOT MEASURED</text>
            <foreignObject x={center - slot / 2 + 4} y={labelTop} width={slot - 8} height={64}>
              <div className="vb-label-wrap"><span className="vb-method-label">{row.label}</span>{coverage !== undefined && <span className={lowCoverage ? 'vb-coverage vb-low' : 'vb-coverage'}>coverage {format(coverage, 1)}%</span>}</div>
            </foreignObject>
          </g>
          const outOfScale = capAbove && row.value > domain[1]
          const displayValue = outOfScale ? domain[1] : row.value
          const zero = y(Math.max(domain[0], 0))
          const barY = y(displayValue)
          const barHeight = Math.max(2, zero - barY)
          const lowerY = interval ? y(capAbove ? Math.min(row.lower!, domain[1]) : row.lower!) : undefined
          const upperY = interval ? y(capAbove ? Math.min(row.upper!, domain[1]) : row.upper!) : undefined
          return <g key={row.id}>
            <title>{aria}</title>
            <rect className={`vb-bar${lowCoverage ? ' vb-bar-low-coverage' : ''}`} x={center - 25} y={barY} width="50" height={barHeight} rx="4" fill={color} role={onBarClick ? 'button' : undefined} tabIndex={onBarClick ? 0 : undefined} aria-label={aria} onClick={() => onBarClick?.(row)} onKeyDown={(event) => onKeyDown(event, row)} />
            {interval && <g className="vb-interval"><line x1={center} x2={center} y1={upperY} y2={lowerY} /><line x1={center - 7} x2={center + 7} y1={upperY} y2={upperY} /><line x1={center - 7} x2={center + 7} y1={lowerY} y2={lowerY} /></g>}
            <text className="vb-value" x={center} y={Math.max(top - 5, barY - 8)} textAnchor="middle">{exactValue}</text>
            {outOfScale && <text className="vb-outscale-marker" x={center} y={top + 13} textAnchor="middle" aria-label="Above zoom range">↑</text>}
            <foreignObject x={center - slot / 2 + 4} y={labelTop} width={slot - 8} height={64}>
              <div className="vb-label-wrap"><span className="vb-method-label" title={row.label}>{row.label}</span>{coverageAnnotation && coverage !== undefined && <span className={lowCoverage ? 'vb-coverage vb-low' : 'vb-coverage'}>{`coverage ${format(coverage, 1)}%${lowCoverage ? ' · LOW COVERAGE' : ''}`}</span>}{!coverageAnnotation && lowCoverage && <span className="vb-coverage vb-low">LOW COVERAGE</span>}</div>
            </foreignObject>
          </g>
        })}
      </svg>
    </div>
  </figure>
}
