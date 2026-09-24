import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import type { FrameGeometry, MetricCard, MethodRecord, Point, VisualCase, VisualFrame } from './types'

type ViewerMode = 'representative' | 'worst_case'

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function assetUrl(src: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(src.startsWith('/') ? src.slice(1) : src, base).toString()
}

function timestampLabel(frame?: VisualFrame): string {
  if (!frame) return 'time unavailable'
  const timestamp = number(frame.timestampMs) ?? number(frame.timeMs)
  return timestamp === undefined ? 'time unavailable' : `${(timestamp / 1000).toFixed(3)} s`
}

function sourceFrameLabel(frame?: VisualFrame): string {
  if (!frame) return '—'
  return String(frame.sourceFrameNumber ?? frame.frameIndex)
}

function casePerturbation(item?: VisualCase): string | undefined {
  if (!item) return undefined
  const value = item.perturbationType ?? item.perturbation ?? (item as Record<string, unknown>).transformType
  return typeof value === 'string' ? value : undefined
}

function caseSeverity(item?: VisualCase): number | string | undefined {
  if (!item) return undefined
  return item.severityValue ?? item.severity ?? (item.parameters?.severity as number | string | undefined)
}

function originalSource(item?: VisualCase, frame?: VisualFrame): string | undefined {
  if (!item) return undefined
  const raw = frame?.originalSourceSrc ?? item.originalSourceSrc ?? (item as Record<string, unknown>).originalSrc
  if (typeof raw === 'string') return raw
  const source = (item as Record<string, unknown>).originalSource
  if (source && typeof source === 'object' && typeof (source as Record<string, unknown>).src === 'string') return (source as Record<string, unknown>).src as string
  return undefined
}

function point(value: unknown): Point | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const x = number(candidate.x)
  const y = number(candidate.y)
  return x === undefined || y === undefined ? undefined : { x, y }
}

function getMaskSrc(geometry?: FrameGeometry): string | undefined {
  const mask = geometry?.mask ?? geometry?.predictionMask
  if (typeof mask === 'string') return mask
  if (mask && typeof mask === 'object') {
    const record = mask as Record<string, unknown>
    return typeof record.src === 'string' ? record.src : typeof record.url === 'string' ? record.url : undefined
  }
  return geometry?.maskSrc
}

function flattenedGeometry(value?: FrameGeometry): FrameGeometry | undefined {
  if (!value) return undefined
  const nested = value.geometry
  return nested && typeof nested === 'object' ? { ...value, ...(nested as FrameGeometry) } : value
}

export function getEllipse(geometry?: FrameGeometry) {
  const ellipse = geometry?.ellipse
  if (!ellipse) return undefined
  const rx = number(ellipse.rx) ?? number(ellipse.a) ?? (number(ellipse.major) !== undefined ? ellipse.major! / 2 : undefined)
  const ry = number(ellipse.ry) ?? number(ellipse.b) ?? (number(ellipse.minor) !== undefined ? ellipse.minor! / 2 : undefined)
  const cx = number(ellipse.cx) ?? number(geometry?.center?.x)
  const cy = number(ellipse.cy) ?? number(geometry?.center?.y)
  if (rx === undefined || ry === undefined || cx === undefined || cy === undefined) return undefined
  const angleRad = number(ellipse.angleRad)
  const specifiedRotation = number(ellipse.rotation) ?? number(ellipse.orientationDeg)
    ?? number(geometry?.orientationDeg) ?? (angleRad === undefined ? undefined : angleRad * 180 / Math.PI)
  const rotation = specifiedRotation ?? 0
  const orientationAvailable = geometry?.orientationAvailable !== false && specifiedRotation !== undefined
  return { cx, cy, rx, ry, rotation, orientationAvailable, orientationIrrelevant: Math.abs(rx - ry) < 0.001 }
}

function imageSrc(frame: VisualFrame, item: VisualCase): string | undefined {
  const reference = frame.reference ?? frame.gt
  const fromFrame = frame.sourceSrc ?? reference?.image ?? reference?.frameSrc ?? reference?.src
  const fromCase = item.source ?? (item as Record<string, unknown>).mediaSrc as string | undefined
  const src = typeof fromFrame === 'string' ? fromFrame : typeof fromCase === 'string' && /[./]/.test(fromCase) ? fromCase : undefined
  if (!src) return undefined
  if (/^(https?:|data:|blob:)/.test(src)) return src
  return assetUrl(src)
}

function metricKind(card: MetricCard): string {
  const raw = String(card.overlayType ?? card.metricId ?? card.metric ?? card.id ?? card.title).toLowerCase()
  if (raw.includes('risk')) return 'risk'
  if (raw.includes('coverage') || raw.includes('selective')) return 'coverage'
  if (raw.includes('temporal') || raw.includes('trajectory') || raw.includes('lag') || raw.includes('rmse')) return 'temporal'
  if (raw.includes('runtime') || raw.includes('latency') || raw.includes('fps')) return 'runtime'
  if (raw.includes('orientation') || raw.includes('angle')) return 'orientation'
  if (raw.includes('axis') || raw.includes('major') || raw.includes('minor')) return 'axes'
  if (raw.includes('center') || raw.includes('centre') || raw.includes('centroid')) return 'center'
  if (raw.includes('area')) return 'area'
  if (raw.includes('assd') || raw.includes('hd95') || raw.includes('boundary')) return 'boundary'
  if (raw.includes('dice') || raw.includes('iou') || raw.includes('mask') || raw.includes('segmentation')) return 'mask'
  return 'diameter'
}

function getDiameter(geometry?: FrameGeometry) {
  return number(geometry?.diameter) ?? number(geometry?.ellipse?.diameter)
}

function Overlay({ geometry, color, width, height, metric, isReference, id }: {
  geometry?: FrameGeometry
  color: string
  width: number
  height: number
  metric: string
  isReference?: boolean
  id: string
}) {
  if (!geometry) return null
  const ellipse = getEllipse(geometry)
  const center = point(geometry.center) ?? (ellipse ? { x: ellipse.cx, y: ellipse.cy } : undefined)
  const methodEllipse = ellipse
  const axisMajor = geometry.axes?.major ?? geometry.ellipse?.majorAxis
  const axisMinor = geometry.axes?.minor ?? geometry.ellipse?.minorAxis
  const diameterLine = geometry.diameterLine ?? geometry.ellipse?.diameterLine
  const equivalentDiameter = getDiameter(geometry)
  const colorFor = isReference ? '#b6f2e8' : color
  const rotation = methodEllipse?.rotation ?? 0

  return (
    <svg className="overlay-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {getMaskSrc(geometry) && <image href={assetUrl(getMaskSrc(geometry)!)} x="0" y="0" width={width} height={height} opacity={metric === 'area' || metric === 'mask' ? (isReference ? 0.38 : 0.42) : 0.2} className={isReference ? 'mask-reference' : 'mask-prediction'} />}
      {(metric === 'diameter' || metric === 'axes' || metric === 'orientation' || metric === 'temporal') && methodEllipse && (methodEllipse.orientationAvailable || methodEllipse.orientationIrrelevant) && (
        <ellipse
          cx={methodEllipse.cx}
          cy={methodEllipse.cy}
          rx={methodEllipse.rx}
          ry={methodEllipse.ry}
          transform={`rotate(${rotation} ${methodEllipse.cx} ${methodEllipse.cy})`}
          fill="none"
          stroke={colorFor}
          strokeWidth={Math.max(1.5, Math.min(width, height) / 180)}
          strokeDasharray={isReference ? '6 5' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {(metric === 'diameter' || metric === 'axes') && diameterLine && <line x1={diameterLine[0].x} y1={diameterLine[0].y} x2={diameterLine[1].x} y2={diameterLine[1].y} stroke={colorFor} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
      {metric === 'diameter' && !diameterLine && center && equivalentDiameter !== undefined && <line
        x1={center.x - equivalentDiameter / 2} y1={center.y}
        x2={center.x + equivalentDiameter / 2} y2={center.y}
        stroke={colorFor} strokeWidth="2.2" strokeLinecap="round"
        strokeDasharray={isReference ? '4 3' : undefined}
        vectorEffect="non-scaling-stroke"
      />}
      {metric === 'axes' && <>
        {axisMajor && <line x1={axisMajor[0].x} y1={axisMajor[0].y} x2={axisMajor[1].x} y2={axisMajor[1].y} stroke={colorFor} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {axisMinor && <line x1={axisMinor[0].x} y1={axisMinor[0].y} x2={axisMinor[1].x} y2={axisMinor[1].y} stroke={colorFor} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </>}
      {metric === 'center' && center && <circle cx={center.x} cy={center.y} r={5} fill={colorFor} stroke="#101c23" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      {metric === 'orientation' && methodEllipse && methodEllipse.orientationAvailable && <>
        <line x1={methodEllipse.cx - methodEllipse.rx} y1={methodEllipse.cy} x2={methodEllipse.cx + methodEllipse.rx} y2={methodEllipse.cy} transform={`rotate(${rotation} ${methodEllipse.cx} ${methodEllipse.cy})`} stroke={colorFor} strokeWidth="2.3" vectorEffect="non-scaling-stroke" />
        <path d={`M ${methodEllipse.cx + methodEllipse.rx * 0.46} ${methodEllipse.cy} A ${methodEllipse.rx * 0.46} ${methodEllipse.rx * 0.46} 0 0 ${rotation >= 0 ? 1 : 0} ${methodEllipse.cx + Math.cos(rotation * Math.PI / 180) * methodEllipse.rx * 0.46} ${methodEllipse.cy + Math.sin(rotation * Math.PI / 180) * methodEllipse.rx * 0.46}`} fill="none" stroke={colorFor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </>}
      {(metric === 'boundary' || metric === 'mask' || metric === 'area') && typeof geometry.boundary === 'string' && geometry.boundary.startsWith('M') && <path d={geometry.boundary} fill="none" stroke={colorFor} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      {geometry.boundarySrc && metric === 'boundary' && <image href={assetUrl(geometry.boundarySrc)} x="0" y="0" width={width} height={height} opacity="0.9" />}
      {metric === 'center' && center && <g className="overlay-point-label"><text x={center.x + 7} y={center.y - 7}>{isReference ? 'GT' : 'pred'}</text></g>}
      <defs><filter id={id}><feGaussianBlur stdDeviation="0" /></filter></defs>
    </svg>
  )
}

function Timeline({ item, frameIndex, onChange }: { item: VisualCase; frameIndex: number; onChange: (index: number) => void }) {
  const frames = item.frames ?? []
  const frame = frames[frameIndex]
  return <div className="timeline-row">
    <span className="frame-readout">Frame <b>{sourceFrameLabel(frame)}</b><i>·</i><b>{timestampLabel(frame)}</b></span>
    <input
      aria-label="Timeline scrubber"
      type="range"
      min={0}
      max={Math.max(0, frames.length - 1)}
      value={frameIndex}
      onChange={(event) => onChange(Number(event.target.value))}
      disabled={frames.length < 2}
    />
    <span className="frame-count">{frames.length ? `${frameIndex + 1} / ${frames.length}` : 'No frames'}</span>
  </div>
}

function CoverageTimeline({ item, methods, frameIndex, onChange, threshold }: {
  item: VisualCase
  methods: MethodRecord[]
  frameIndex: number
  onChange: (index: number) => void
  threshold?: number
}) {
  const frames = item.frames ?? []
  return <div className="acceptance-timeline">
    <div className="acceptance-heading"><strong>ACCEPTANCE TIMELINE</strong><span>Choose a frame; every evidence tile follows.</span></div>
    {methods.map((method) => <div className="acceptance-row" key={method.methodId}>
      <span className="acceptance-method">{method.methodName ?? method.label ?? method.methodId}</span>
      <div className="acceptance-cells">{frames.map((frame, index) => {
        const geometry = flattenedGeometry(frame.methods?.[method.methodId])
        const selected = geometry?.riskCoverage?.length && threshold !== undefined
          ? [...geometry.riskCoverage].sort((a, b) => Math.abs(a.threshold - threshold) - Math.abs(b.threshold - threshold))[0]
          : undefined
        const accepted = selected?.accepted ?? geometry?.accepted
        const status = accepted === true ? 'accepted' : accepted === false ? 'rejected' : 'unknown'
        return <button key={`${method.methodId}-${index}`} className={`${status} ${index === frameIndex ? 'current' : ''}`} title={`Source frame ${sourceFrameLabel(frame)} · ${timestampLabel(frame)} · ${accepted === undefined ? 'decision unavailable' : accepted ? 'accepted' : 'rejected'}${geometry?.rejectionReason ? ` · ${geometry.rejectionReason}` : ''}`} aria-label={`${method.methodName ?? method.methodId}, source frame ${sourceFrameLabel(frame)}: ${status}`} onClick={() => onChange(index)} />
      })}</div>
    </div>)}
    <div className="acceptance-legend"><span className="accepted">Accepted</span><span className="rejected">Rejected</span><span className="unknown">Not reported</span></div>
  </div>
}

function overlayMetrics(geometry: FrameGeometry | undefined, gt: FrameGeometry | undefined, method: MethodRecord, kind: string) {
  const pairs: Array<[string, string]> = []
  const value = getDiameter(geometry)
  const gtValue = getDiameter(gt)
  if (kind === 'diameter') {
    if (gtValue !== undefined) pairs.push(['GT diameter', `${gtValue.toFixed(2)} ${method.unit ?? 'px'}`])
    if (value !== undefined) pairs.push(['Predicted diameter', `${value.toFixed(2)} ${method.unit ?? 'px'}`])
    const signed = number(geometry?.signedDifference)
    if (signed !== undefined) pairs.push(['Signed difference', `${signed >= 0 ? '+' : ''}${signed.toFixed(2)} ${method.unit ?? 'px'}`])
    if (number(geometry?.relativeError) !== undefined) pairs.push(['Relative error', `${(geometry!.relativeError! * 100).toFixed(2)}%`])
  }
  if (kind === 'center') {
    if (number(geometry?.errorPx) !== undefined) pairs.push(['Center error', `${geometry!.errorPx!.toFixed(2)} px`])
  }
  if (kind === 'area') {
    if (number(geometry?.area) !== undefined) pairs.push(['Predicted area', `${geometry!.area!.toFixed(1)} px²`])
    if (number(gt?.area) !== undefined) pairs.push(['GT area', `${gt!.area!.toFixed(1)} px²`])
  }
  if (kind === 'axes') {
    if (number(geometry?.ellipse?.major) !== undefined) pairs.push(['Major axis', `${number(geometry?.ellipse?.major)!.toFixed(2)} px`])
    if (number(geometry?.ellipse?.minor) !== undefined) pairs.push(['Minor axis', `${number(geometry?.ellipse?.minor)!.toFixed(2)} px`])
    if (number(geometry?.majorSignedDifference) !== undefined) pairs.push(['Major-axis difference', `${geometry!.majorSignedDifference!.toFixed(2)} px`])
    if (number(geometry?.minorSignedDifference) !== undefined) pairs.push(['Minor-axis difference', `${geometry!.minorSignedDifference!.toFixed(2)} px`])
  }
  if (kind === 'orientation' && number(geometry?.orientationDeg) !== undefined) pairs.push(['Orientation', `${number(geometry?.orientationDeg)!.toFixed(1)}°`])
  if ((kind === 'mask' || kind === 'boundary') && number(geometry?.value) !== undefined) pairs.push(['Metric value', `${String(geometry?.value)} ${method.unit ?? ''}`.trim()])
  if (kind === 'area') {
    if (number(geometry?.falsePositiveArea) !== undefined) pairs.push(['False-positive area', `${String(geometry?.falsePositiveArea)} px²`])
    if (number(geometry?.falseNegativeArea) !== undefined) pairs.push(['False-negative area', `${String(geometry?.falseNegativeArea)} px²`])
  }
  if (kind === 'runtime') {
    const provenance = method.provenance ?? {}
    const runtime = provenance.runtime && typeof provenance.runtime === 'object' ? provenance.runtime as Record<string, unknown> : provenance
    const fields: Array<[string, string, string]> = [
      ['p50', 'p50', ' ms'], ['p95', 'p95', ' ms'], ['p99', 'p99', ' ms'],
      ['FPS', 'fps', ''], ['End-to-end p50', 'endToEndP50', ' ms'],
    ]
    fields.forEach(([label, key, suffix]) => {
      const value = number(method[key] ?? runtime[key])
      if (value !== undefined) pairs.push([label, `${value.toFixed(2)}${suffix}`])
    })
    if (method.backend) pairs.push(['Backend', method.backend])
    if (method.precision) pairs.push(['Precision', method.precision])
  }
  if (kind === 'coverage' || kind === 'risk') {
    pairs.push(['Decision', geometry?.accepted === false ? 'Rejected' : geometry?.accepted === true ? 'Accepted' : 'Not reported'])
    if (number(geometry?.confidence) !== undefined) pairs.push(['Confidence', number(geometry?.confidence)!.toFixed(3)])
    if (number(geometry?.threshold) !== undefined) pairs.push(['Threshold', number(geometry?.threshold)!.toFixed(3)])
    if (geometry?.rejectionReason) pairs.push(['Reason', geometry.rejectionReason])
  }
  return pairs
}

function Tile({ label, color, item, frame, geometry, reference, metric, method, pinned }: {
  label: string
  color: string
  item: VisualCase
  frame: VisualFrame
  geometry?: FrameGeometry
  reference?: FrameGeometry
  metric: string
  method?: MethodRecord
  pinned?: boolean
}) {
  const svgId = useId()
  const width = number(frame.width) ?? 640
  const height = number(frame.height) ?? 480
  const src = imageSrc(frame, item)
  const gt = flattenedGeometry(reference ?? frame.reference ?? frame.gt)
  const rows = overlayMetrics(geometry, gt, method ?? { methodId: 'reference' }, metric)
  const imageGeometry = geometry ?? gt
  const accepted = imageGeometry?.accepted
  const comparison = geometry?.maskComparison
  const comparisonSrc = comparison && typeof comparison === 'object' && typeof comparison.src === 'string' ? comparison.src : undefined
  const isOriginalSource = pinned && label.includes('ORIGINAL SOURCE')
  const overlayNote = (() => {
    if (isOriginalSource) return 'Untransformed source; exact GT is displayed on the transformed-source tile.'
    if (pinned) return getMaskSrc(gt)
      ? metric === 'diameter' && getDiameter(gt) !== undefined && !getEllipse(gt)?.orientationAvailable
        ? 'GT mask and area-equivalent diameter scale line shown; ellipse orientation unavailable.'
        : 'GT mask and exported geometry shown.'
      : 'N/A · reference mask not exported for this frame.'
    if (metric === 'diameter' && getDiameter(geometry) === undefined) return 'N/A · scored diameter not exported for this frame.'
    if (metric === 'diameter' && getDiameter(geometry) !== undefined && !getEllipse(geometry)?.orientationAvailable && !geometry?.diameterLine && !geometry?.ellipse?.diameterLine) return 'Area-equivalent diameter scale line shown; ellipse orientation was not exported.'
    if (metric === 'temporal' && getDiameter(geometry) === undefined) return `N/A · ${String(geometry?.unavailableReason ?? geometry?.rejectionReason ?? geometry?.status ?? 'native prediction unavailable for this frame')}`
    if (metric === 'center' && (!point(geometry?.center) || !point(gt?.center))) return 'N/A · center coordinates unavailable; no vector drawn.'
    if (metric === 'axes' && !geometry?.axes?.major && !geometry?.axes?.minor && !geometry?.ellipse?.majorAxis && !geometry?.ellipse?.minorAxis) return 'Axis lengths may be available; axis direction is not exported.'
    if (metric === 'orientation' && number(geometry?.orientationDeg) === undefined && number(geometry?.ellipse?.orientationDeg) === undefined && number(geometry?.ellipse?.rotation) === undefined) return 'N/A · orientation was not exported; no angle is inferred.'
    if ((metric === 'area' || metric === 'mask') && !getMaskSrc(geometry)) return 'N/A · native prediction mask not retained for this method.'
    if (metric === 'boundary' && !geometry?.boundarySrc && !(typeof geometry?.boundary === 'string' && geometry.boundary.startsWith('M'))) return 'N/A · scored boundary geometry not exported.'
    if ((metric === 'coverage' || metric === 'risk') && accepted === undefined) return 'N/A · acceptance decision not exported for this frame.'
    return undefined
  })()
  return <article className={`evidence-tile ${pinned ? 'reference-tile' : ''}`} style={{ '--method-color': color } as CSSProperties}>
    <header className="tile-head">
      <span className="tile-title"><i aria-hidden="true" />{label}</span>
      {method && (method.backend || method.precision) && <span className="deployment-badges">{method.backend && <b>{method.backend}</b>}{method.precision && <b>{method.precision}</b>}</span>}
      <span className="tile-subhead">Frame {sourceFrameLabel(frame)} · {timestampLabel(frame)}</span>
    </header>
    <div className="tile-image-wrap" style={{ aspectRatio: `${width} / ${height}` }}>
      {src ? <img src={src} alt={`${label}, source frame ${sourceFrameLabel(frame)}`} loading="lazy" /> : <div className="missing-frame"><span>FRAME ASSET NOT EXPORTED</span><small>{item.sourceId ?? item.source ?? 'Source ID unavailable'}</small></div>}
      <Overlay geometry={gt} color="#b6f2e8" width={width} height={height} metric={metric} isReference id={`${svgId}-gt`} />
      {!pinned && <Overlay geometry={geometry} color={color} width={width} height={height} metric={metric} id={`${svgId}-pred`} />}
      {(metric === 'mask' || metric === 'area') && !pinned && !comparisonSrc && getMaskSrc(gt) && getMaskSrc(geometry) && <div className="mask-key"><span className="gt-key">GT mask</span><span className="pred-key">Prediction</span></div>}
      {metric === 'center' && !pinned && point(geometry?.center) && point(gt?.center) && <svg className="overlay-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><line x1={point(gt?.center)!.x} y1={point(gt?.center)!.y} x2={point(geometry?.center)!.x} y2={point(geometry?.center)!.y} className="center-vector" vectorEffect="non-scaling-stroke" /></svg>}
      {!pinned && (metric === 'coverage' || metric === 'risk') && <div className={`decision-chip ${accepted === false ? 'rejected' : accepted === true ? 'accepted' : 'unknown'}`}>{accepted === false ? 'REJECTED' : accepted === true ? 'ACCEPTED' : 'STATUS N/A'}</div>}
    </div>
    {(metric === 'mask' || metric === 'area' || metric === 'boundary') && !pinned && comparisonSrc && <figure className="mask-comparison">
      <img src={assetUrl(comparisonSrc)} alt={`${label}: exact pixel overlap against ground truth; green is overlap, blue is prediction only, red is ground truth only`} loading="lazy" />
      <figcaption><strong>EXACT PIXEL OVERLAP</strong><span><i className="true-positive" />Both masks</span><span><i className="false-positive" />Prediction only · false positive</span><span><i className="false-negative" />GT only · false negative</span></figcaption>
    </figure>}
    <div className="tile-stats">
      {pinned
        ? <span className="reference-note">{isOriginalSource ? 'Original source frame' : 'Raw source · human / exact GT reference'}</span>
        : rows.length
          ? rows.map(([key, value]) => <span key={key}><small>{key}</small><b>{value}</b></span>)
          : <span className="reference-note">{metric === 'mask' ? 'Scored masks shown when exported' : 'Metric overlay shown when exported'}</span>}
      {overlayNote && <span className="overlay-na">{overlayNote}</span>}
      {!pinned && (metric === 'coverage' || metric === 'risk') && imageGeometry?.rejectionReason && <span className="rejection-reason">{imageGeometry.rejectionReason}</span>}
    </div>
  </article>
}

function TemporalTraces({ item, methods, frameIndex }: { item: VisualCase; methods: MethodRecord[]; frameIndex: number }) {
  const frames = item.frames ?? []
  if (frames.length < 2) return null
  const values = frames.flatMap((frame) => {
    const ref = flattenedGeometry(frame.reference ?? frame.gt)
    const gt = getDiameter(ref)
    return [gt, ...methods.map((method) => getDiameter(flattenedGeometry(frame.methods?.[method.methodId])))].filter((value): value is number => value !== undefined)
  })
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (index: number) => 28 + index * 584 / Math.max(1, frames.length - 1)
  const y = (value: number) => 14 + (max - value) * 106 / span
  const pathFor = (methodId?: string) => {
    let path = ''
    let drawing = false
    frames.forEach((frame, index) => {
      const value = methodId ? getDiameter(flattenedGeometry(frame.methods?.[methodId])) : getDiameter(flattenedGeometry(frame.reference ?? frame.gt))
      if (value === undefined) { drawing = false; return }
      path += `${drawing ? 'L' : 'M'} ${x(index)} ${y(value)} `
      drawing = true
    })
    return path
  }
  const residuals = frames.flatMap((frame) => methods.flatMap((method) => {
    const value = number(flattenedGeometry(frame.methods?.[method.methodId])?.residual)
    return value === undefined ? [] : [{ methodId: method.methodId, value }]
  }))
  const residualMin = residuals.length ? Math.min(...residuals.map((row) => row.value)) : 0
  const residualMax = residuals.length ? Math.max(...residuals.map((row) => row.value)) : 0
  const residualSpan = residualMax - residualMin || 1
  const residualY = (value: number) => 12 + (residualMax - value) * 42 / residualSpan
  const residualPath = (methodId: string) => {
    let path = ''
    let drawing = false
    frames.forEach((frame, index) => {
      const value = number(flattenedGeometry(frame.methods?.[methodId])?.residual)
      if (value === undefined) { drawing = false; return }
      path += `${drawing ? 'L' : 'M'} ${x(index)} ${residualY(value)} `
      drawing = true
    })
    return path
  }
  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)]
  const timeCursor = x(Math.min(frameIndex, frames.length - 1))
  return <div className="temporal-traces">
    <div className="trace-title"><strong>Trajectory and residual</strong><span>Current frame follows the synchronized viewer</span></div>
    <svg viewBox="0 0 640 136" role="img" aria-label="Ground truth and model pupil diameter over time">
      <line x1={timeCursor} x2={timeCursor} y1="8" y2="126" className="trace-cursor" />
      <path d={pathFor()} className="trace-gt" />
      {methods.map((method) => <path key={method.methodId} d={pathFor(method.methodId)} stroke={method.color ?? method.familyColor ?? '#74818a'} className="trace-model" />)}
      <text x={Math.min(600, timeCursor + 5)} y="12" className="trace-cursor-label">{timestampLabel(currentFrame)}</text>
    </svg>
    {residuals.length ? <div className="residual-traces">
      <small>EXPORTED RESIDUAL</small>
      <svg viewBox="0 0 640 68" role="img" aria-label="Exported model residual by frame">
        <line x1={timeCursor} x2={timeCursor} y1="4" y2="64" className="trace-cursor" />
        {methods.map((method) => <path key={method.methodId} d={residualPath(method.methodId)} stroke={method.color ?? method.familyColor ?? '#74818a'} className="trace-model" />)}
      </svg>
    </div> : <div className="trace-na">Per-frame residual values are not exported for this visual case.</div>}
    <div className="trace-legend"><span><i className="legend-gt" />GT trajectory</span>{methods.map((method) => <span key={method.methodId}><i style={{ background: method.color ?? method.familyColor ?? '#74818a' }} />{method.methodName ?? method.label ?? method.methodId} trajectory</span>)}</div>
  </div>
}

function thresholdOptions(card: MetricCard, item: VisualCase) {
  const fromCard = card.riskCoverage?.map((row) => row.threshold) ?? []
  const fromFrames = (item.frames ?? []).flatMap((frame) => Object.values(frame.methods ?? {}).flatMap((geometry) => geometry.riskCoverage?.map((row) => row.threshold) ?? []))
  return [...new Set([...fromCard, ...fromFrames])].sort((a, b) => a - b)
}

export default function EvidenceViewer({ card, methods, identities, cases }: {
  card: MetricCard
  methods: MethodRecord[]
  identities: Array<{ methodId: string; id?: string; variantId?: string; color?: string; familyColor?: string }>
  cases: VisualCase[]
}) {
  const [mode, setMode] = useState<ViewerMode>('representative')
  const filteredCases = useMemo(() => cases.filter((item) => {
    const worst = item.outcomeSelected === true || item.mode === 'worst_case' || item.kind === 'worst_case'
    return mode === 'worst_case' ? worst : !worst
  }), [cases, mode])
  const [caseId, setCaseId] = useState('')
  const [perturbation, setPerturbation] = useState('')
  const activeCase = filteredCases.find((item) => item.id === caseId) ?? filteredCases[0]
  const frames = useMemo(() => activeCase?.frames ?? [], [activeCase])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [riskMethodId, setRiskMethodId] = useState('')
  const [riskPointIndex, setRiskPointIndex] = useState(-1)
  const kind = metricKind(card)
  const riskMethods = methods.filter((method) => method.riskCoverage?.length)
  const riskMethod = riskMethods.find((method) => method.methodId === riskMethodId) ?? riskMethods[0]
  const riskPoints = [...(riskMethod?.riskCoverage ?? [])].sort((a, b) => a.coverage - b.coverage)
  const selectedRiskIndex = riskPointIndex < 0 ? Math.max(0, riskPoints.length - 1) : Math.min(riskPointIndex, Math.max(0, riskPoints.length - 1))
  const selectedRiskPoint = riskPoints[selectedRiskIndex]
  const thresholds = activeCase ? thresholdOptions(card, activeCase) : []
  const selectedThreshold = selectedRiskPoint ? selectedRiskPoint.threshold ?? undefined : thresholds[0]
  const perturbationOptions = [...new Set(filteredCases.map(casePerturbation).filter((value): value is string => Boolean(value)))].sort()
  const activePerturbation = perturbation || casePerturbation(activeCase) || perturbationOptions[0] || ''
  const severityCases = filteredCases.filter((item) => !activePerturbation || casePerturbation(item) === activePerturbation)
  const severityOptions = [...new Set(severityCases.map(caseSeverity).filter((value): value is number | string => value !== undefined))]
  const numericSeverities = severityOptions.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b)
  const activeSeverity = caseSeverity(activeCase)
  const matchingSeverityCase = (severity: number | string) => severityCases.find((candidate) =>
    caseSeverity(candidate) === severity
    && candidate.sourceId === activeCase?.sourceId
    && candidate.parameters?.edge === activeCase?.parameters?.edge,
  ) ?? severityCases.find((candidate) => caseSeverity(candidate) === severity)

  useEffect(() => { setFrameIndex(0); setPlaying(false) }, [activeCase?.id, mode])
  useEffect(() => {
    if (!playing || frames.length < 2) return
    const current = frames[frameIndex]
    const next = frames[(frameIndex + 1) % frames.length]
    const baseDelay = number(next?.timestampMs) !== undefined && number(current?.timestampMs) !== undefined
      ? Math.max(50, number(next.timestampMs)! - number(current.timestampMs)!)
      : 180
    const timer = window.setTimeout(() => {
      if (frameIndex + 1 >= frames.length && !loop) setPlaying(false)
      else setFrameIndex((index) => (index + 1) % frames.length)
    }, baseDelay / speed)
    return () => window.clearTimeout(timer)
  }, [playing, frameIndex, frames, loop, speed])

  const frame = frames[frameIndex]
  const gt = flattenedGeometry(frame?.reference ?? frame?.gt)
  const itemLabel = activeCase?.label ?? 'No case selected'
  return <section className="evidence-panel" aria-label="Synchronized visual comparison">
    <div className="evidence-toolbar">
      <div className="evidence-heading"><span className="section-kicker">SYNCHRONIZED EVIDENCE</span><strong>{itemLabel}</strong><span>{activeCase?.sourceId ?? activeCase?.source ?? 'Source metadata pending'}{activeCase?.perturbation ? ` · ${activeCase.perturbation}` : ''}{activeCase?.crop ? ` · ${activeCase.crop}` : ''}</span></div>
      <div className="evidence-selectors">
        <div className="segmented-control" role="group" aria-label="Evidence case mode">
          <button className={mode === 'representative' ? 'selected' : ''} onClick={() => { setMode('representative'); setCaseId(''); setPerturbation('') }}>Representative</button>
          <button className={mode === 'worst_case' ? 'selected' : ''} onClick={() => { setMode('worst_case'); setCaseId(''); setPerturbation('') }}>Worst cases</button>
        </div>
        <label className="select-label">CASE<select value={activeCase?.id ?? ''} onChange={(event) => { const next = filteredCases.find((candidate) => candidate.id === event.target.value); setCaseId(event.target.value); setPerturbation(casePerturbation(next) ?? ''); setFrameIndex(0); setPlaying(false) }} disabled={!filteredCases.length}>
          {!filteredCases.length && <option value="">Evidence pending</option>}
          {filteredCases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </div>
    </div>
    {mode === 'worst_case' && <p className="outcome-note">Outcome-selected QC examples — not representative.</p>}
    {card.category === 'exact_gt' && <div className="exact-controls">
      <label>PERTURBATION<select value={activePerturbation} onChange={(event) => {
        const selected = event.target.value
        setPerturbation(selected)
        const first = filteredCases.find((candidate) => casePerturbation(candidate) === selected)
        setCaseId(first?.id ?? '')
        setFrameIndex(0)
      }} disabled={!perturbationOptions.length}>
        {!perturbationOptions.length && <option value="">Frozen severity media pending</option>}
        {perturbationOptions.map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
      {numericSeverities.length > 1 && numericSeverities.length === severityOptions.length ? <label className="severity-range">SEVERITY <strong>{String(activeSeverity ?? numericSeverities[0])}</strong><input type="range" min={0} max={numericSeverities.length - 1} step={1} value={Math.max(0, numericSeverities.indexOf(typeof activeSeverity === 'number' ? activeSeverity : numericSeverities[0]))} onChange={(event) => {
        const nextSeverity = numericSeverities[Number(event.target.value)]
        const selected = matchingSeverityCase(nextSeverity)
        setCaseId(selected?.id ?? '')
        setFrameIndex(0)
      }} /></label> : <label>SEVERITY<select value={String(activeSeverity ?? '')} onChange={(event) => {
        const selected = matchingSeverityCase(severityOptions.find((value) => String(value) === event.target.value) ?? event.target.value)
        setCaseId(selected?.id ?? '')
        setFrameIndex(0)
      }} disabled={!severityOptions.length}>
        {!severityOptions.length && <option value="">Not exported</option>}
        {severityOptions.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
      </select></label>}
      {activeCase?.parameters && <span className="exact-parameters">{Object.entries(activeCase.parameters).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</span>}
    </div>}
    {kind === 'risk' && riskMethod && selectedRiskPoint && <div className="risk-control">
      <div className="risk-control-head">
        <label>METHOD<select value={riskMethod.methodId} onChange={(event) => { setRiskMethodId(event.target.value); setRiskPointIndex(-1) }}>
          {riskMethods.map((method) => <option key={method.methodId} value={method.methodId}>{method.methodName ?? method.label ?? method.methodId}</option>)}
        </select></label>
        <span>Confidence thresholds are native to each method; compare its curve within that method.</span>
      </div>
      <svg className="risk-curve" viewBox="0 0 600 166" role="img" aria-label={`${riskMethod.methodName ?? riskMethod.methodId} frozen risk by coverage`}>
        <line x1="36" y1="130" x2="580" y2="130" className="risk-axis" />
        <line x1="36" y1="12" x2="36" y2="130" className="risk-axis" />
        <text x="36" y="152">0% coverage</text><text x="580" y="152" textAnchor="end">100% coverage</text>
        {(() => {
          const maxRisk = Math.max(...riskPoints.map((point) => point.risk), 0.001)
          const x = (coverage: number) => 36 + coverage * 544
          const y = (risk: number) => 130 - risk / maxRisk * 116
          return <>
            <path d={riskPoints.map((point, index) => `${index ? 'L' : 'M'}${x(point.coverage).toFixed(2)} ${y(point.risk).toFixed(2)}`).join(' ')} fill="none" stroke={riskMethod.color ?? riskMethod.familyColor ?? '#73b8ae'} strokeWidth="2.2" />
            <circle cx={x(selectedRiskPoint.coverage)} cy={y(selectedRiskPoint.risk)} r="5" fill={riskMethod.color ?? riskMethod.familyColor ?? '#73b8ae'} stroke="#ffffff" strokeWidth="1.5" />
          </>
        })()}
      </svg>
      <label htmlFor={`risk-${card.id}`}>Frozen operating point <strong>{selectedRiskIndex + 1} / {riskPoints.length}</strong></label>
      <input id={`risk-${card.id}`} type="range" min={0} max={Math.max(0, riskPoints.length - 1)} step={1} value={selectedRiskIndex} onChange={(event) => setRiskPointIndex(Number(event.target.value))} />
      <div className="risk-readout">
        <span><small>Threshold</small><strong>{selectedRiskPoint.threshold === null ? selectedRiskPoint.thresholdLabel ?? 'No confidence cutoff' : selectedRiskPoint.threshold.toFixed(6)}</strong></span>
        <span><small>Coverage</small><strong>{(selectedRiskPoint.coverage * 100).toFixed(2)}%</strong></span>
        <span><small>Family-macro diameter ARE</small><strong>{(selectedRiskPoint.risk * 100).toFixed(2)}%</strong></span>
        {selectedRiskPoint.retained !== undefined && selectedRiskPoint.attempted !== undefined && <span><small>Retained / attempted</small><strong>{selectedRiskPoint.retained} / {selectedRiskPoint.attempted}</strong></span>}
      </div>
      <p className="risk-curve-note">These values are precomputed frozen score rows. Frame decisions at alternate thresholds appear only when frozen per-frame confidence evidence is exported.</p>
    </div>}
    {kind === 'risk' && !riskMethod && <p className="risk-curve-note">A frozen risk-coverage curve is not available for these methods.</p>}
    {activeCase && frame ? <>
      <div className="sync-controls">
        <div className="transport-controls">
          <button aria-label="Previous frame" title="Previous frame" onClick={() => { setPlaying(false); setFrameIndex((index) => Math.max(0, index - 1)) }} disabled={frameIndex === 0}>‹</button>
          <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
          <button aria-label="Next frame" title="Next frame" onClick={() => { setPlaying(false); setFrameIndex((index) => Math.min(frames.length - 1, index + 1)) }} disabled={frameIndex + 1 >= frames.length}>›</button>
        </div>
        <Timeline item={activeCase} frameIndex={frameIndex} onChange={(index) => { setFrameIndex(index); setPlaying(false) }} />
        <label className="speed-select">SPEED<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
        <label className="loop-toggle"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
      </div>
      {(kind === 'coverage' || (kind === 'risk' && frames.some((candidate) => Object.values(candidate.methods ?? {}).some((geometry) => geometry.riskCoverage?.length)))) && <CoverageTimeline item={activeCase} methods={methods} frameIndex={frameIndex} onChange={(index) => { setFrameIndex(index); setPlaying(false) }} threshold={selectedThreshold} />}
      <div className="sync-grid">
        <div className="grid-caption"><span>REFERENCE FIRST</span><span>All tiles share source · frame · timestamp · crop</span></div>
        <div className="evidence-tiles">
          {card.category === 'exact_gt' && originalSource(activeCase, frame) && <Tile label="REFERENCE · ORIGINAL SOURCE" color="#b6f2e8" item={activeCase} frame={{ ...frame, sourceSrc: originalSource(activeCase, frame), reference: undefined, gt: undefined }} geometry={undefined} reference={undefined} metric={kind} pinned />}
          <Tile label={card.category === 'exact_gt' ? 'TRANSFORMED SOURCE · EXACT GT' : 'REFERENCE · HUMAN / EXACT GT'} color="#b6f2e8" item={activeCase} frame={frame} geometry={gt} reference={gt} metric={kind} pinned />
          {methods.map((method) => {
            const framePrediction = frame.methods?.[method.methodId] ?? frame.methods?.[method.id ?? '']
            const row = identities.find((identity) => [identity.methodId, identity.id, identity.variantId].includes(method.methodId))
            const prediction = flattenedGeometry(framePrediction)
            if (kind === 'risk' && selectedThreshold !== undefined && prediction?.riskCoverage?.length) {
              const selected = [...prediction.riskCoverage].sort((a, b) => Math.abs(a.threshold - selectedThreshold) - Math.abs(b.threshold - selectedThreshold))[0]
              if (selected) { prediction.accepted = selected.accepted; prediction.threshold = selected.threshold }
            } else if (kind === 'risk' && prediction) {
              prediction.accepted = undefined
              prediction.rejectionReason = 'Decision at selected threshold was not exported for this frame.'
            }
            return <Tile key={method.methodId} label={method.methodName ?? method.label ?? method.methodId} color={method.color ?? row?.color ?? row?.familyColor ?? '#74818a'} item={activeCase} frame={frame} geometry={prediction} reference={gt} metric={kind} method={method} />
          })}
        </div>
      </div>
      {kind === 'temporal' && <TemporalTraces item={activeCase} methods={methods} frameIndex={frameIndex} />}
      {kind === 'runtime' && <div className="runtime-note">Playback is synchronized for visual comparison. Runtime values come from the frozen timing harness.</div>}
    </> : <div className="evidence-empty">
      <span className="empty-icon">▧</span>
      <strong>{filteredCases.length ? 'Sequential frame export is unavailable for this case' : 'No visual cases are exported for this metric'}</strong>
      <span>The evidence viewer will populate from the versioned media manifest.</span>
    </div>}
  </section>
}
