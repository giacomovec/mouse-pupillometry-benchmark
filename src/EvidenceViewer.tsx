import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import type { FrameGeometry, MetricCard, MethodRecord, Point, VisualCase, VisualFrame } from './types'
import { methodColor as fixedMethodColor } from './palette'
import './EvidenceViewer.css'

type ViewerMode = 'representative' | 'worst_case'
type OutputMode = 'native' | 'scored'
type MetricKind = 'diameter' | 'center' | 'area' | 'mask' | 'boundary' | 'coverage' | 'risk' | 'axes' | 'orientation' | 'temporal' | 'runtime'

type EvidenceViewerProps = {
  card: MetricCard
  methods: MethodRecord[]
  identities: Array<{ methodId: string; id?: string; variantId?: string; color?: string; familyColor?: string }>
  cases: VisualCase[]
  /** Optional initial selections for evidence opened from a figure point. */
  initialMethodAId?: string
  initialMethodBId?: string
  initialCaseId?: string
  onMethodsChange?: (methodAId: string, methodBId: string) => void
}

type EvidenceNumbers = {
  displayedDistance?: number
  scorePlaneError?: number
  difference?: number
}

export const CENTER_REFERENCE_NOTE = 'The vector joins the displayed human-reference mask centroid and prediction center. The frozen score-plane centroid_error_px uses the score row’s true_center_x/y reference; this display uses the centroid of the exported human-reference mask. Those definitions can differ fractionally, so the visible vector length may not reproduce the frozen score.'
const PUBLISHED_METHOD_PRIORITY = [
  'meye_released',
  'pupil_dlc_gm',
  'standard_dlc_matched',
  'dlc_zoo_mouse_pupil_vclose',
  'neuropupil_animal',
  'mouse_pupil_analysis_v020',
  'classical_fixed',
]
const EMPTY_FRAMES: VisualFrame[] = []

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function point(value: unknown): Point | undefined {
  const candidate = record(value)
  const x = finite(candidate?.x)
  const y = finite(candidate?.y)
  return x === undefined || y === undefined ? undefined : { x, y }
}

function centerOf(geometry?: FrameGeometry): Point | undefined {
  return point(geometry?.center) ?? point({ x: geometry?.ellipse?.cx, y: geometry?.ellipse?.cy })
}

/**
 * Keep the visible coordinate distance and the frozen score value separate.
 * Real-validation reference-mask centroids and score-plane reference centers are distinct
 * exported references, so one must not silently replace the other.
 */
export function centerEvidenceNumbers(gtCenter?: Point, predictionCenter?: Point, scorePlaneError?: number): EvidenceNumbers {
  const displayedDistance = gtCenter && predictionCenter
    ? Math.hypot(predictionCenter.x - gtCenter.x, predictionCenter.y - gtCenter.y)
    : undefined
  const score = finite(scorePlaneError)
  return {
    displayedDistance,
    scorePlaneError: score,
    difference: displayedDistance !== undefined && score !== undefined ? score - displayedDistance : undefined,
  }
}

function assetUrl(src: string): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src
  const base = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(src.startsWith('/') ? src.slice(1) : src, base).toString()
}

function frameLabel(frame?: VisualFrame): string {
  return String(frame?.sourceFrameNumber ?? frame?.frameIndex ?? '—')
}

function timeLabel(frame?: VisualFrame): string {
  const timestamp = finite(frame?.timestampMs) ?? finite(frame?.timeMs)
  return timestamp === undefined ? 'time unavailable' : `${(timestamp / 1000).toFixed(3)} s`
}

function caseTransform(item?: VisualCase): string | undefined {
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
  const value = frame?.originalSourceSrc ?? item.originalSourceSrc ?? (item as Record<string, unknown>).originalSrc
  if (typeof value === 'string') return value
  const nested = record((item as Record<string, unknown>).originalSource)
  return typeof nested?.src === 'string' ? nested.src : undefined
}

function sourceUrl(frame: VisualFrame, item: VisualCase): string | undefined {
  const reference = frame.reference ?? frame.gt
  const fromFrame = frame.sourceSrc ?? reference?.image ?? reference?.frameSrc ?? reference?.src
  const fromCase = item.source ?? (item as Record<string, unknown>).mediaSrc
  const value = typeof fromFrame === 'string' ? fromFrame : typeof fromCase === 'string' ? fromCase : undefined
  return value ? assetUrl(value) : undefined
}

function flattened(value?: FrameGeometry): FrameGeometry | undefined {
  if (!value) return undefined
  const nested = record(value.geometry)
  return nested ? { ...value, ...nested } as FrameGeometry : value
}

function metricKind(card: MetricCard): MetricKind {
  const raw = String(card.overlayType ?? card.metricId ?? card.metric ?? card.id ?? card.title).toLowerCase()
  if (raw.includes('risk')) return 'risk'
  if (raw.includes('coverage') || raw.includes('selective')) return 'coverage'
  if (raw.includes('temporal') || raw.includes('trajectory') || raw.includes('lag') || raw.includes('rmse') || raw.includes('gain')) return 'temporal'
  if (raw.includes('runtime') || raw.includes('latency') || raw.includes('fps')) return 'runtime'
  if (raw.includes('orientation') || raw.includes('angle')) return 'orientation'
  if (raw.includes('axis') || raw.includes('major') || raw.includes('minor')) return 'axes'
  if (raw.includes('center') || raw.includes('centre') || raw.includes('centroid')) return 'center'
  if (raw.includes('area')) return 'area'
  if (raw.includes('assd') || raw.includes('hd95') || raw.includes('boundary')) return 'boundary'
  if (raw.includes('dice') || raw.includes('iou') || raw.includes('mask') || raw.includes('segmentation')) return 'mask'
  return 'diameter'
}

function getDiameter(geometry?: FrameGeometry): number | undefined {
  return finite(geometry?.diameter) ?? finite(geometry?.ellipse?.diameter)
}

export function getEllipse(geometry?: FrameGeometry) {
  const ellipse = geometry?.ellipse
  if (!ellipse) return undefined
  const rx = finite(ellipse.rx) ?? finite(ellipse.a) ?? (finite(ellipse.major) !== undefined ? ellipse.major! / 2 : undefined)
  const ry = finite(ellipse.ry) ?? finite(ellipse.b) ?? (finite(ellipse.minor) !== undefined ? ellipse.minor! / 2 : undefined)
  const center = point({ x: ellipse.cx, y: ellipse.cy }) ?? point(geometry?.center)
  if (rx === undefined || ry === undefined || !center) return undefined
  const angle = finite(ellipse.angleRad)
  const rotation = finite(ellipse.rotation) ?? finite(ellipse.orientationDeg) ?? finite(geometry?.orientationDeg)
    ?? (angle === undefined ? undefined : angle * 180 / Math.PI)
  return {
    cx: center.x,
    cy: center.y,
    rx,
    ry,
    rotation: rotation ?? 0,
    orientationAvailable: geometry?.orientationAvailable !== false && rotation !== undefined,
    orientationIrrelevant: Math.abs(rx - ry) < 0.001,
  }
}

function maskUrl(geometry?: FrameGeometry): string | undefined {
  const row = geometry as Record<string, unknown> | undefined
  const value = row?.mask ?? row?.predictionMask ?? row?.nativeMask
  if (typeof value === 'string') return value
  const nested = record(value)
  if (typeof nested?.src === 'string') return nested.src
  if (typeof nested?.url === 'string') return nested.url
  return typeof row?.maskSrc === 'string' ? row.maskSrc : undefined
}

function methodKeys(method: MethodRecord, identities: EvidenceViewerProps['identities']): string[] {
  const identity = identities.find((item) => [item.methodId, item.id, item.variantId].includes(method.methodId))
  return [method.methodId, method.id, identity?.id, identity?.variantId].filter((value): value is string => Boolean(value))
}

function methodPayload(frame: VisualFrame, method: MethodRecord, identities: EvidenceViewerProps['identities']): FrameGeometry | undefined {
  for (const key of methodKeys(method, identities)) {
    const value = frame.methods?.[key]
    if (value) return value
  }
  return undefined
}

function scoredGeometry(raw?: FrameGeometry): FrameGeometry | undefined {
  if (!raw) return undefined
  const row = raw as Record<string, unknown>
  return flattened((record(row.scoredGeometry) ?? record(row.scoredOutput) ?? record(row.scored) ?? record(row.geometry) ?? row) as FrameGeometry)
}

function nativeGeometry(raw?: FrameGeometry): FrameGeometry | undefined {
  if (!raw) return undefined
  const row = raw as Record<string, unknown>
  const native = record(row.nativeOutput) ?? record(row.native) ?? record(row.nativeGeometry)
  const ellipse = record(row.nativeEllipse)
  const nativeKeypoints = Array.isArray(row.nativeKeypoints) ? row.nativeKeypoints : Array.isArray(row.keypoints) ? row.keypoints : undefined
  const nativeMask = row.nativeMask ?? native?.mask ?? native?.predictionMask
  const nativeDetails = record(native?.geometry)
  const candidate: Record<string, unknown> = {
    ...(nativeDetails ?? {}),
    ...(native ?? {}),
    ellipse: native?.ellipse ?? nativeDetails?.ellipse ?? ellipse,
    center: native?.center ?? nativeDetails?.center ?? row.nativeCenter ?? (ellipse ? { x: ellipse.cx, y: ellipse.cy } : undefined),
    keypoints: nativeKeypoints ?? native?.keypoints,
    mask: nativeMask,
    predictionMask: nativeMask,
    diameter: native?.diameter ?? row.nativeDiameter,
    area: native?.area ?? row.nativeArea,
    boundary: native?.boundary ?? row.nativeBoundary,
    boundarySrc: native?.boundarySrc ?? row.nativeBoundarySrc,
  }
  return hasRenderableFields(candidate) ? candidate as FrameGeometry : undefined
}

function hasRenderableFields(value: Record<string, unknown>): boolean {
  const center = point(value.center)
  return Boolean(
    center || value.ellipse || value.diameter !== undefined || value.area !== undefined
    || value.boundary || value.boundarySrc || value.keypoints || value.mask || value.predictionMask,
  )
}

function nativeAsset(raw?: FrameGeometry): string | undefined {
  if (!raw) return undefined
  const row = raw as Record<string, unknown>
  const native = record(row.nativeOutput) ?? record(row.native)
  const src = row.nativeOutputSrc ?? native?.src ?? native?.imageSrc
  return typeof src === 'string' ? src : undefined
}

function maskComparison(raw?: FrameGeometry): { src?: string; unavailableReason?: string } {
  if (!raw) return {}
  const row = raw as Record<string, unknown>
  const comparison = record(row.maskComparison) ?? record((record(row.geometry) ?? {}).maskComparison)
  const src = typeof comparison?.src === 'string' ? comparison.src : undefined
  const reason = row.maskComparisonUnavailableReason ?? row.maskOverlayUnavailableReason
  return { src, unavailableReason: typeof reason === 'string' ? reason : undefined }
}

function metricEvidenceAvailable(kind: MetricKind, geometry?: FrameGeometry, raw?: FrameGeometry): boolean {
  if (!geometry) return false
  if (kind === 'runtime') return false
  if (kind === 'diameter') return getDiameter(geometry) !== undefined
  if (kind === 'center') return centerOf(geometry) !== undefined
  if (kind === 'area' || kind === 'mask') return Boolean(maskUrl(geometry) || maskComparison(raw).src)
  if (kind === 'boundary') return Boolean(geometry.boundarySrc || (typeof geometry.boundary === 'string' && geometry.boundary.startsWith('M')))
  if (kind === 'coverage' || kind === 'risk') return geometry.accepted !== undefined || finite(geometry.confidence) !== undefined
  if (kind === 'axes') return Boolean(geometry.axes?.major || geometry.axes?.minor || geometry.ellipse?.major !== undefined || geometry.ellipse?.minor !== undefined)
  if (kind === 'orientation') return getEllipse(geometry)?.orientationAvailable === true
  if (kind === 'temporal') return getDiameter(geometry) !== undefined || centerOf(geometry) !== undefined
  return false
}

function metricUnavailableMessage(kind: MetricKind, raw?: FrameGeometry): string {
  if (kind === 'runtime') return 'Per-frame latency evidence unavailable. Timing is measured by the frozen runtime harness; synchronized pixels do not demonstrate runtime.'
  if ((kind === 'area' || kind === 'mask') && raw) {
    const comparison = maskComparison(raw)
    if (comparison.unavailableReason) return `Metric-specific native evidence unavailable: ${comparison.unavailableReason}`
  }
  const name = kind === 'mask' ? 'mask-overlap' : kind === 'boundary' ? 'boundary' : kind === 'coverage' || kind === 'risk' ? 'frame decision' : kind
  return `Metric-specific native evidence unavailable: exported ${name} geometry or media is not available for this method and frame.`
}

function geometryForMetric(raw: FrameGeometry | undefined, mode: OutputMode): FrameGeometry | undefined {
  return mode === 'native' ? nativeGeometry(raw) : scoredGeometry(raw)
}

function outputModeOptions(raw?: FrameGeometry, kind?: MetricKind): { native: boolean; scored: boolean } {
  if (!raw || !kind) return { native: false, scored: false }
  const native = nativeGeometry(raw)
  const scored = scoredGeometry(raw)
  return {
    native: metricEvidenceAvailable(kind, native, raw) || Boolean(nativeAsset(raw)),
    scored: metricEvidenceAvailable(kind, scored, raw),
  }
}

function methodLabel(method?: MethodRecord): string {
  return method?.methodName ?? method?.label ?? method?.name ?? method?.methodId ?? 'Method output'
}

function defaultPair(methods: MethodRecord[], initialA?: string, initialB?: string): [string, string] {
  const ids = methods.map((method) => method.methodId)
  const first = initialA && ids.includes(initialA) ? initialA : ids.includes('segformer_b2') ? 'segformer_b2' : ids[0] ?? ''
  const preferred = PUBLISHED_METHOD_PRIORITY.find((id) => id !== first && ids.includes(id))
  const second = initialB && ids.includes(initialB) && initialB !== first
    ? initialB
    : preferred ?? methods.find((method) => method.methodId !== first && method.family !== methods.find((item) => item.methodId === first)?.family)?.methodId
      ?? ids.find((id) => id !== first)
      ?? ''
  return [first, second]
}

function displayedMethods(methods: MethodRecord[], all: boolean, pair: [MethodRecord | undefined, MethodRecord | undefined], extras: string[]): MethodRecord[] {
  if (all) return methods
  const ids = [pair[0]?.methodId, pair[1]?.methodId, ...extras].filter((value): value is string => Boolean(value))
  return [...new Set(ids)].map((id) => methods.find((method) => method.methodId === id)).filter((method): method is MethodRecord => Boolean(method))
}

function pointText(value: Point | undefined): string | undefined {
  return value ? `(${value.x.toFixed(3)}, ${value.y.toFixed(3)}) px` : undefined
}

function scoreValue(raw: FrameGeometry | undefined, kind: MetricKind): { name: string; value: number } | undefined {
  if (!raw) return undefined
  const row = raw as Record<string, unknown>
  const values = record(row.values)
  const metricNames: Partial<Record<MetricKind, string[]>> = {
    diameter: ['diameter_are', 'diameter_mae_px', 'diameter_signed_error_px'],
    center: ['center_error_px'],
    area: ['area_are'],
    mask: ['dice', 'iou'],
    boundary: ['assd_px', 'hd95_px'],
    temporal: ['diameter_rmse_px', 'diameter_rmse', 'diameter_mae_px'],
    coverage: ['coverage'],
    risk: ['diameter_are', 'family_macro_diameter_are'],
  }
  for (const name of metricNames[kind] ?? []) {
    const value = finite(values?.[name]) ?? finite(row[name])
    if (value !== undefined) return { name, value }
  }
  const maskMetrics = record(row.maskMetrics)
  for (const name of metricNames[kind] ?? []) {
    const value = finite(maskMetrics?.[name])
    if (value !== undefined) return { name, value }
  }
  return undefined
}

export function scoreReadout(metric: { name: string; value: number }): [string, string] {
  const { name, value } = metric
  if (name === 'diameter_are' || name === 'family_macro_diameter_are') return ['Frozen diameter ARE', `${(value * 100).toFixed(2)}%`]
  if (name === 'area_are') return ['Frozen area ARE', `${(value * 100).toFixed(2)}%`]
  if (name === 'coverage') return ['Frozen accepted-frame coverage', `${(value * 100).toFixed(2)}%`]
  if (name === 'dice' || name === 'iou') return [`Frozen ${name.toUpperCase()}`, value.toFixed(4)]
  const labels: Record<string, string> = { diameter_mae_px: 'Frozen diameter absolute error', diameter_signed_error_px: 'Frozen diameter signed error', center_error_px: 'Frozen center error', assd_px: 'Frozen ASSD', hd95_px: 'Frozen HD95', diameter_rmse_px: 'Frozen diameter RMSE', diameter_rmse: 'Frozen diameter RMSE' }
  return [labels[name] ?? `Frozen ${name}`, `${value.toFixed(4)} px`]
}

function metricReadouts(raw: FrameGeometry | undefined, geometry: FrameGeometry | undefined, gt: FrameGeometry | undefined, kind: MetricKind, outputMode: OutputMode, method: MethodRecord): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  const gtCenter = centerOf(gt)
  const predictionCenter = centerOf(geometry)
  const unit = method.unit ?? 'px'
  if (outputMode === 'scored' && ['diameter', 'center', 'area', 'mask', 'boundary', 'temporal'].includes(kind)) {
    const metric = scoreValue(raw, kind)
    if (metric !== undefined) rows.push(scoreReadout(metric))
  }
  if (kind === 'diameter') {
    const gtValue = getDiameter(gt)
    const prediction = getDiameter(geometry)
    if (gtValue !== undefined) rows.push(['Human reference diameter', `${gtValue.toFixed(2)} ${unit}`])
    if (prediction !== undefined) rows.push(['Predicted diameter', `${prediction.toFixed(2)} ${unit}`])
    const signed = finite(geometry?.signedDifference)
    if (signed !== undefined) rows.push(['Signed difference', `${signed >= 0 ? '+' : ''}${signed.toFixed(2)} ${unit}`])
    const relativeError = finite(geometry?.relativeError)
    if (relativeError !== undefined) rows.push(['Relative error', `${(relativeError * 100).toFixed(2)}%`])
  }
  if (kind === 'center') {
    const centerNumbers = centerEvidenceNumbers(gtCenter, predictionCenter, finite(raw?.errorPx) ?? scoreValue(raw, 'center')?.value)
    if (gtCenter) rows.push(['Displayed human-reference mask centroid', pointText(gtCenter)!])
    if (predictionCenter) rows.push(['Prediction center', pointText(predictionCenter)!])
    if (centerNumbers.displayedDistance !== undefined) rows.push(['Displayed point distance', `${centerNumbers.displayedDistance.toFixed(4)} px`])
    if (centerNumbers.scorePlaneError !== undefined) rows.push(['Frozen score-plane error', `${centerNumbers.scorePlaneError.toFixed(4)} px`])
  }
  if (kind === 'area') {
    if (finite(geometry?.area) !== undefined) rows.push(['Predicted area', `${geometry!.area!.toFixed(1)} px²`])
    if (finite(gt?.area) !== undefined) rows.push(['Human-reference area', `${gt!.area!.toFixed(1)} px²`])
    if (finite(geometry?.falsePositiveArea) !== undefined) rows.push(['False-positive area', `${geometry!.falsePositiveArea!.toFixed(1)} px²`])
    if (finite(geometry?.falseNegativeArea) !== undefined) rows.push(['False-negative area', `${geometry!.falseNegativeArea!.toFixed(1)} px²`])
  }
  if (kind === 'axes') {
    if (finite(geometry?.ellipse?.major) !== undefined) rows.push(['Major axis', `${geometry!.ellipse!.major!.toFixed(2)} px`])
    if (finite(geometry?.ellipse?.minor) !== undefined) rows.push(['Minor axis', `${geometry!.ellipse!.minor!.toFixed(2)} px`])
    if (finite(geometry?.majorSignedDifference) !== undefined) rows.push(['Major-axis difference', `${geometry!.majorSignedDifference!.toFixed(2)} px`])
    if (finite(geometry?.minorSignedDifference) !== undefined) rows.push(['Minor-axis difference', `${geometry!.minorSignedDifference!.toFixed(2)} px`])
  }
  if (kind === 'orientation' && finite(geometry?.orientationDeg) !== undefined) rows.push(['Orientation', `${geometry!.orientationDeg!.toFixed(2)}°`])
  if (kind === 'coverage' || kind === 'risk') {
    rows.push(['Decision', geometry?.accepted === undefined ? 'Not reported' : geometry.accepted ? 'Accepted' : 'Rejected'])
    if (finite(geometry?.confidence) !== undefined) rows.push(['Confidence', geometry!.confidence!.toFixed(4)])
    if (finite(geometry?.threshold) !== undefined) rows.push(['Threshold', geometry!.threshold!.toFixed(6)])
    if (geometry?.rejectionReason) rows.push(['Reason', geometry.rejectionReason])
  }
  return rows
}

function Overlay({ geometry, color, width, height, kind, reference = false }: {
  geometry?: FrameGeometry
  color: string
  width: number
  height: number
  kind: MetricKind
  reference?: boolean
}) {
  if (!geometry) return null
  const ellipse = getEllipse(geometry)
  const center = centerOf(geometry)
  const diameter = getDiameter(geometry)
  const diameterLine = geometry.diameterLine ?? geometry.ellipse?.diameterLine
  const mask = maskUrl(geometry)
  const boundarySrc = geometry.boundarySrc
  const stroke = reference ? '#75d8c4' : color
  const keypoints = Array.isArray((geometry as Record<string, unknown>).keypoints)
    ? ((geometry as Record<string, unknown>).keypoints as unknown[]).map(point).filter((value): value is Point => Boolean(value))
    : []
  return <svg className="ev-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    {mask && <image href={assetUrl(mask)} x="0" y="0" width={width} height={height} opacity={kind === 'area' || kind === 'mask' ? 0.46 : 0.2} className={reference ? 'ev-mask-gt' : 'ev-mask-pred'} />}
    {(kind === 'diameter' || kind === 'axes' || kind === 'orientation' || kind === 'temporal') && ellipse && (ellipse.orientationAvailable || ellipse.orientationIrrelevant) && <ellipse
      cx={ellipse.cx} cy={ellipse.cy} rx={ellipse.rx} ry={ellipse.ry}
      transform={`rotate(${ellipse.rotation} ${ellipse.cx} ${ellipse.cy})`}
      fill="none" stroke={stroke} strokeWidth="2" strokeDasharray={reference ? '5 4' : undefined} vectorEffect="non-scaling-stroke"
    />}
    {kind === 'diameter' && diameterLine && <line x1={diameterLine[0].x} y1={diameterLine[0].y} x2={diameterLine[1].x} y2={diameterLine[1].y} stroke={stroke} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />}
    {kind === 'diameter' && !diameterLine && center && diameter !== undefined && !ellipse?.orientationAvailable && <line
      x1={center.x - diameter / 2} y1={center.y} x2={center.x + diameter / 2} y2={center.y}
      stroke={stroke} strokeWidth="2.4" strokeDasharray={reference ? '5 4' : undefined} vectorEffect="non-scaling-stroke"
    />}
    {kind === 'axes' && geometry.axes?.major && <line x1={geometry.axes.major[0].x} y1={geometry.axes.major[0].y} x2={geometry.axes.major[1].x} y2={geometry.axes.major[1].y} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    {kind === 'axes' && geometry.axes?.minor && <line x1={geometry.axes.minor[0].x} y1={geometry.axes.minor[0].y} x2={geometry.axes.minor[1].x} y2={geometry.axes.minor[1].y} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    {kind === 'center' && center && <g><circle cx={center.x} cy={center.y} r="4.8" fill={stroke} stroke="#152326" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /><text className="ev-point-label" x={center.x + 6} y={center.y - 6}>{reference ? 'REF' : 'pred'}</text></g>}
    {kind === 'orientation' && ellipse?.orientationAvailable && <line
      x1={ellipse.cx - ellipse.rx} y1={ellipse.cy} x2={ellipse.cx + ellipse.rx} y2={ellipse.cy}
      transform={`rotate(${ellipse.rotation} ${ellipse.cx} ${ellipse.cy})`} stroke={stroke} strokeWidth="2.4" vectorEffect="non-scaling-stroke"
    />}
    {(kind === 'boundary' || kind === 'area' || kind === 'mask') && typeof geometry.boundary === 'string' && geometry.boundary.startsWith('M') && <path d={geometry.boundary} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    {boundarySrc && kind === 'boundary' && <image href={assetUrl(boundarySrc)} x="0" y="0" width={width} height={height} opacity="0.9" />}
    {keypoints.map((keypoint, index) => <circle key={index} cx={keypoint.x} cy={keypoint.y} r="3.2" fill={stroke} stroke="#152326" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
  </svg>
}

function MediaCanvas({ item, frame, geometry, gt, kind, color, isReference }: {
  item: VisualCase
  frame: VisualFrame
  geometry?: FrameGeometry
  gt?: FrameGeometry
  kind: MetricKind
  color: string
  isReference?: boolean
}) {
  const width = finite(frame.width) ?? 640
  const height = finite(frame.height) ?? 480
  const src = sourceUrl(frame, item)
  const gtCenter = centerOf(gt)
  const predictedCenter = centerOf(geometry)
  const accepted = geometry?.accepted
  return <div className="ev-media" style={{ aspectRatio: `${width} / ${height}` }}>
    {src ? <img className="ev-source" src={src} alt={`${item.label}, source frame ${frameLabel(frame)}`} loading="lazy" />
      : <div className="ev-no-media">SOURCE FRAME NOT EXPORTED</div>}
    {(gt ?? (isReference ? geometry : undefined)) && <Overlay geometry={gt ?? geometry} color="#75d8c4" width={width} height={height} kind={kind} reference />}
    {!isReference && geometry && <Overlay geometry={geometry} color={color} width={width} height={height} kind={kind} />}
    {!isReference && kind === 'center' && gtCenter && predictedCenter && <svg className="ev-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={gtCenter.x} y1={gtCenter.y} x2={predictedCenter.x} y2={predictedCenter.y} className="ev-center-vector" vectorEffect="non-scaling-stroke" />
    </svg>}
    {!isReference && (kind === 'coverage' || kind === 'risk') && <span className={`ev-decision ${accepted === undefined ? 'unknown' : accepted ? 'accepted' : 'rejected'}`}>{accepted === undefined ? 'DECISION N/A' : accepted ? 'ACCEPTED' : 'REJECTED'}</span>}
  </div>
}

function getMaskComparison(raw?: FrameGeometry): { src?: string; unavailableReason?: string } {
  return maskComparison(raw)
}

function Tile({ item, frame, gt, method, raw, kind, outputMode, onOutputModeChange, isReference, label, exactOriginal }: {
  item: VisualCase
  frame: VisualFrame
  gt?: FrameGeometry
  method?: MethodRecord
  raw?: FrameGeometry
  kind: MetricKind
  outputMode: OutputMode
  onOutputModeChange?: (mode: OutputMode) => void
  isReference?: boolean
  label: string
  exactOriginal?: string
}) {
  const labelId = useId()
  const output = isReference ? gt : geometryForMetric(raw, outputMode)
  const hasEvidence = isReference || (
    (metricEvidenceAvailable(kind, output, raw) || (outputMode === 'native' && Boolean(nativeAsset(raw))))
    && (kind !== 'center' || centerOf(gt) !== undefined)
  )
  const color = isReference ? '#75d8c4' : method ? fixedMethodColor(method.methodId, method.family) : '#557fbd'
  const rows = isReference ? [] : metricReadouts(raw, output, gt, kind, outputMode, method ?? { methodId: 'method' })
  const outputOptions = isReference ? { native: false, scored: false } : outputModeOptions(raw, kind)
  const canToggleOutput = outputOptions.native && outputOptions.scored
  const comparison = getMaskComparison(raw)
  const comparisonSrc = (kind === 'mask' || kind === 'area' || kind === 'boundary') && comparison.src ? assetUrl(comparison.src) : undefined
  const conversionPath = record(raw?.provenance)?.conversionPath ?? (raw as Record<string, unknown> | undefined)?.conversionPath
  const nativeSrc = outputMode === 'native' ? nativeAsset(raw) : undefined
  const provenance = record(raw?.provenance)
  const scoreFile = provenance?.frameMetricsFile
  const scoreHash = provenance?.frameMetricsSha256
  const conversionLabel = typeof conversionPath === 'string'
    ? `Conversion path: ${conversionPath}`
    : method?.representation
      ? `Exported representation: ${method.representation}`
      : undefined
  const conditionLine = method
    ? [method.operatingPoint, method.backend, method.precision].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ')
    : ''

  return <article className={`ev-tile ${isReference ? 'ev-reference-tile' : ''}`} style={{ '--ev-color': color } as CSSProperties} aria-labelledby={labelId}>
    <header className="ev-tile-head">
      <div><span className="ev-eyebrow">{isReference ? label.toLowerCase().includes('exact known reference') || label.toLowerCase().includes('exact reference') ? 'EXACT KNOWN REFERENCE' : 'HUMAN REFERENCE' : 'METHOD OUTPUT'}</span><h3 id={labelId}>{label}</h3>{conditionLine && <p className="ev-condition-line">{conditionLine}</p>}</div>
      <span className="ev-frame-meta">Frame {frameLabel(frame)}<br />{timeLabel(frame)}</span>
    </header>
    {exactOriginal && <figure className="ev-original-source"><img src={assetUrl(exactOriginal)} alt="Original source frame before the exact known reference transform" loading="lazy" /><figcaption>ORIGINAL SOURCE</figcaption></figure>}
    {hasEvidence
      ? <MediaCanvas item={item} frame={frame} geometry={output} gt={isReference ? undefined : gt} kind={kind} color={color} isReference={isReference} />
      : <div className="ev-unavailable" role="status"><strong>Metric-specific evidence unavailable</strong><span>{metricUnavailableMessage(kind, raw)}</span></div>}
    {nativeSrc && outputMode === 'native' && hasEvidence && <figure className="ev-native-asset"><img src={assetUrl(nativeSrc)} alt={`${label}: exported native model output`} loading="lazy" /><figcaption>EXPORTED NATIVE OUTPUT</figcaption></figure>}
    {comparisonSrc && hasEvidence && <figure className="ev-mask-comparison"><img src={comparisonSrc} alt={`${label}: exported pixel comparison of predicted and human-reference masks`} loading="lazy" /><figcaption><strong>EXPORTED MASK COMPARISON</strong><span><i className="ev-overlap" />overlap</span><span><i className="ev-fp" />prediction only</span><span><i className="ev-fn" />reference only</span></figcaption></figure>}
    <div className="ev-tile-foot">
      {!isReference && <div className="ev-output-control">
        {canToggleOutput
          ? <div className="ev-output-toggle" role="group" aria-label={`${label} output representation`}>
            <button type="button" className={outputMode === 'native' ? 'selected' : ''} onClick={() => onOutputModeChange?.('native')}>Native</button>
            <button type="button" className={outputMode === 'scored' ? 'selected' : ''} onClick={() => onOutputModeChange?.('scored')}>Scored</button>
          </div>
          : <span className="ev-output-badge">{outputOptions.native ? 'NATIVE OUTPUT' : outputOptions.scored ? 'SCORED OUTPUT' : 'OUTPUT N/A'}</span>}
        {conversionLabel && <small>{conversionLabel}</small>}
      </div>}
      {rows.length > 0 && <dl className="ev-readouts">{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
      {isReference && <p className="ev-reference-caption">{label.toLowerCase().includes('exact known reference') || label.toLowerCase().includes('exact reference') ? 'Source image paired with the exported exact known reference geometry.' : 'Raw source with the exported human reference geometry.'}</p>}
      {!isReference && kind === 'diameter' && output && getDiameter(output) !== undefined && !getEllipse(output)?.orientationAvailable && !output.diameterLine && !output.ellipse?.diameterLine && <p className="ev-note">Horizontal line shows exported area-equivalent diameter; ellipse orientation is unavailable.</p>}
      {!isReference && kind === 'center' && <p className="ev-note">{CENTER_REFERENCE_NOTE}</p>}
      {!isReference && (kind === 'coverage' || kind === 'risk') && output?.rejectionReason && <p className="ev-rejection">{output.rejectionReason}</p>}
      {!isReference && typeof scoreFile === 'string' && <details className="ev-provenance"><summary>Score row provenance</summary><code>{scoreFile}</code>{typeof scoreHash === 'string' && <code>SHA-256 {scoreHash}</code>}</details>}
    </div>
  </article>
}

function Timeline({ frame, length, index, onChange }: { frame?: VisualFrame; length: number; index: number; onChange: (index: number) => void }) {
  return <div className="ev-timeline">
    <span>Frame <b>{frameLabel(frame)}</b><i>·</i><b>{timeLabel(frame)}</b></span>
    <input aria-label="Synchronized frame scrubber" type="range" min={0} max={Math.max(0, length - 1)} value={index} onChange={(event) => onChange(Number(event.target.value))} disabled={length < 2} />
    <span>{length ? `${index + 1} / ${length}` : 'No frames'}</span>
  </div>
}

function CoverageTimeline({ item, methods, frameIndex, onChange }: { item: VisualCase; methods: MethodRecord[]; frameIndex: number; onChange: (index: number) => void }) {
  const frames = item.frames ?? []
  return <div className="ev-acceptance">
    <div className="ev-acceptance-head"><strong>FRAME ACCEPTANCE</strong><span>Select a frame; all visible method tiles stay synchronized.</span></div>
    {methods.map((method) => <div className="ev-acceptance-row" key={method.methodId}><b>{methodLabel(method)}</b><div>{frames.map((frame, index) => {
      const geometry = scoredGeometry(methodPayload(frame, method, []))
      const status = geometry?.accepted === true ? 'accepted' : geometry?.accepted === false ? 'rejected' : 'unknown'
      return <button key={`${method.methodId}-${index}`} type="button" className={`${status} ${index === frameIndex ? 'current' : ''}`} onClick={() => onChange(index)} aria-label={`${methodLabel(method)}, frame ${frameLabel(frame)}: ${status}`} title={`${methodLabel(method)} · frame ${frameLabel(frame)} · ${status}`} />
    })}</div></div>)}
    <div className="ev-acceptance-legend"><span className="accepted">Accepted</span><span className="rejected">Rejected</span><span className="unknown">Not reported</span></div>
  </div>
}

function RiskCurve({ card, methods, selectedId, onMethodChange }: { card: MetricCard; methods: MethodRecord[]; selectedId: string; onMethodChange: (id: string) => void }) {
  const riskMethods = methods.filter((method) => method.riskCoverage?.length)
  const method = riskMethods.find((candidate) => candidate.methodId === selectedId) ?? riskMethods[0]
  const points = [...(method?.riskCoverage ?? [])].sort((a, b) => a.coverage - b.coverage)
  if (!method || points.length < 2) return <p className="ev-risk-note">A frozen multi-point risk–coverage curve is not exported for these methods. No curve has been interpolated.</p>
  const maxRisk = Math.max(...points.map((point) => point.risk), 0.001)
  const x = (value: number) => 34 + Math.max(0, Math.min(1, value)) * 544
  const y = (value: number) => 130 - value / maxRisk * 112
  return <section className="ev-risk-curve" aria-label="Population risk coverage curve">
    <div><strong>FROZEN POPULATION RISK–COVERAGE</strong><label>Method<select aria-label="Risk curve method" value={method.methodId} onChange={(event) => onMethodChange(event.target.value)}>{riskMethods.map((row) => <option key={row.methodId} value={row.methodId}>{methodLabel(row)}</option>)}</select></label></div>
    <svg viewBox="0 0 600 160" role="img" aria-label={`${methodLabel(method)} population risk by coverage`}>
      <line x1="34" y1="130" x2="578" y2="130" /><line x1="34" y1="16" x2="34" y2="130" />
      <text x="34" y="151">0% coverage</text><text x="578" y="151" textAnchor="end">100% coverage</text>
      <path d={points.map((point, index) => `${index ? 'L' : 'M'}${x(point.coverage)} ${y(point.risk)}`).join(' ')} />
      {points.map((point, index) => <circle key={index} cx={x(point.coverage)} cy={y(point.risk)} r="3.5"><title>{`${(point.coverage * 100).toFixed(2)}% coverage · ${(point.risk * 100).toFixed(2)}% family-macro ARE`}</title></circle>)}
    </svg>
    <p>Population-level frozen score rows. Frame decisions are shown only when the selected frame’s confidence evidence was exported.</p>
    <span className="ev-sr-only">Card {card.title}</span>
  </section>
}

function TemporalTraces({ item, methods, identities, frameIndex }: { item: VisualCase; methods: MethodRecord[]; identities: EvidenceViewerProps['identities']; frameIndex: number }) {
  const frames = item.frames ?? []
  if (frames.length < 2) return null
  const values = frames.flatMap((frame) => {
    const gt = getDiameter(scoredGeometry(frame.reference ?? frame.gt))
    return [gt, ...methods.map((method) => getDiameter(scoredGeometry(methodPayload(frame, method, identities))))].filter((value): value is number => value !== undefined)
  })
  if (!values.length) return <p className="ev-risk-note">A multi-frame diameter trace is not exported for this case.</p>
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || 1
  const x = (index: number) => 28 + index * 584 / (frames.length - 1)
  const y = (value: number) => 14 + (high - value) * 104 / span
  const pathFor = (id?: string) => {
    let drawing = false
    return frames.map((frame, index) => {
      const geometry = id
        ? scoredGeometry(methodPayload(frame, methods.find((method) => method.methodId === id) ?? { methodId: id }, identities))
        : scoredGeometry(frame.reference ?? frame.gt)
      const value = getDiameter(geometry)
      if (value === undefined) { drawing = false; return '' }
      const segment = `${drawing ? 'L' : 'M'} ${x(index)} ${y(value)}`
      drawing = true
      return segment
    }).filter(Boolean).join(' ')
  }
  const currentX = x(Math.min(frameIndex, frames.length - 1))
  return <section className="ev-temporal" aria-label="Synchronized temporal trace">
    <div><strong>TEMPORAL TRACE</strong><span>The cursor follows the shared frame controls.</span></div>
    <svg viewBox="0 0 640 136" role="img" aria-label="Ground-truth and selected method diameter over time">
      <line x1={currentX} x2={currentX} y1="7" y2="121" className="ev-trace-cursor" />
      <path d={pathFor()} className="ev-trace-gt" />
      {methods.map((method) => {
        return <path key={method.methodId} d={pathFor(method.methodId)} stroke={fixedMethodColor(method.methodId, method.family)} className="ev-trace-method" />
      })}
      <text x={Math.min(594, currentX + 4)} y="13">{timeLabel(frames[Math.min(frameIndex, frames.length - 1)])}</text>
    </svg>
  </section>
}

function FrameMethodPair({ methods, activeCase, frame, gt, kind, identities, modeByMethod, onModeChange, caseCategory }: {
  methods: MethodRecord[]
  activeCase: VisualCase
  frame: VisualFrame
  gt?: FrameGeometry
  kind: MetricKind
  identities: EvidenceViewerProps['identities']
  modeByMethod: Record<string, OutputMode>
  onModeChange: (id: string, mode: OutputMode) => void
  caseCategory?: string
}) {
  const sourceOriginal = caseCategory === 'exact_gt' ? originalSource(activeCase, frame) : undefined
  return <div className={`ev-grid ${methods.length > 2 ? 'ev-grid-many' : ''}`}>
    <Tile item={activeCase} frame={frame} gt={gt} kind={kind} outputMode="scored" isReference label={caseCategory === 'exact_gt' ? 'Transformed input + exact known reference' : caseCategory === 'temporal' ? 'Raw source + exact known reference' : 'Raw source + human reference'} exactOriginal={sourceOriginal} />
    {methods.map((method) => {
      const raw = methodPayload(frame, method, identities)
      const mode = modeByMethod[method.methodId] ?? 'scored'
      const setter = (next: OutputMode) => onModeChange(method.methodId, next)
      return <Tile key={method.methodId} item={activeCase} frame={frame} gt={gt} method={method} raw={raw} kind={kind} outputMode={mode} onOutputModeChange={setter} label={methodLabel(method)} />
    })}
  </div>
}

function frameMethodsForCase(methods: MethodRecord[], item?: VisualCase, identities: EvidenceViewerProps['identities'] = []): MethodRecord[] {
  if (!item) return []
  return methods.filter((method) => (item.frames ?? []).some((frame) => methodPayload(frame, method, identities) !== undefined))
}

function deploymentUnavailableText(methods: MethodRecord[], initialA?: string, initialB?: string): string {
  const baselineIds = new Set(['segformer_b2', 'segformer_b2__pytorch_fp32'])
  const selectedId = [initialA, initialB].find((id) => Boolean(id) && !baselineIds.has(id!))
  const selected = selectedId
    ? methods.find((method) => method.methodId === selectedId)
    : undefined
  const parsedId = selectedId?.match(/^segformer_(b[0-2])__(pytorch|inductor|tensorrt)_(fp32|bf16|fp16|int8)$/i)
  const variant = selected
    ? methodLabel(selected)
    : parsedId
      ? `SegFormer ${parsedId[1].toUpperCase()} · ${parsedId[2] === 'pytorch' ? 'PyTorch' : parsedId[2] === 'tensorrt' ? 'TensorRT' : 'Inductor'} · ${parsedId[3].toUpperCase()}`
      : 'this deployment condition'
  return `Per-condition deployment outputs are not exported for ${variant}. The current visual export has canonical SegFormer B0/B1/B2 frames, but no paired PyTorch FP32 baseline and selected-variant predictions or masks for the same frame. Deployment point evidence is unavailable.`
}

export default function EvidenceViewer({ card, methods, identities, cases, initialMethodAId, initialMethodBId, initialCaseId, onMethodsChange }: EvidenceViewerProps) {
  const firstDefaultPair = useMemo(() => defaultPair(methods, initialMethodAId, initialMethodBId), [methods, initialMethodAId, initialMethodBId])
  const initialMode: ViewerMode = cases.find((item) => item.id === initialCaseId)?.outcomeSelected || cases.find((item) => item.id === initialCaseId)?.mode === 'worst_case' ? 'worst_case' : 'representative'
  const [mode, setMode] = useState<ViewerMode>(initialMode)
  const [caseId, setCaseId] = useState(initialCaseId ?? '')
  const [methodAId, setMethodAId] = useState(firstDefaultPair[0])
  const [methodBId, setMethodBId] = useState(firstDefaultPair[1])
  const [compareAll, setCompareAll] = useState(false)
  const [extraIds, setExtraIds] = useState<string[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [outputModes, setOutputModes] = useState<Record<string, OutputMode>>({})
  const [riskMethodId, setRiskMethodId] = useState('')
  const kind = metricKind(card)

  useEffect(() => {
    if (initialMethodAId) setMethodAId(initialMethodAId)
    if (initialMethodBId) setMethodBId(initialMethodBId)
  }, [initialMethodAId, initialMethodBId])
  useEffect(() => {
    if (!initialCaseId) return
    const selected = cases.find((item) => item.id === initialCaseId)
    if (!selected) return
    const selectedMode: ViewerMode = selected.outcomeSelected || selected.mode === 'worst_case' || selected.kind === 'worst_case' ? 'worst_case' : 'representative'
    setMode(selectedMode)
    setCaseId(initialCaseId)
  }, [initialCaseId, cases])

  const filteredCases = useMemo(() => cases.filter((item) => {
    const worst = item.outcomeSelected === true || item.mode === 'worst_case' || item.kind === 'worst_case'
    return mode === 'worst_case' ? worst : !worst
  }), [cases, mode])
  const activeCase = filteredCases.find((item) => item.id === caseId) ?? filteredCases[0]
  const frames = activeCase?.frames ?? EMPTY_FRAMES
  const frame = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))]
  const gt = flattened(frame?.reference ?? frame?.gt)
  const availableMethods = useMemo(() => frameMethodsForCase(methods, activeCase, identities), [methods, activeCase, identities])
  const fallbackPair = defaultPair(availableMethods, initialMethodAId, initialMethodBId)
  const methodA = availableMethods.find((method) => method.methodId === methodAId) ?? availableMethods.find((method) => method.methodId === fallbackPair[0])
  const methodB = availableMethods.find((method) => method.methodId === methodBId && method.methodId !== methodA?.methodId)
    ?? availableMethods.find((method) => method.methodId === fallbackPair[1] && method.methodId !== methodA?.methodId)
    ?? availableMethods.find((method) => method.methodId !== methodA?.methodId)
  const pair: [MethodRecord | undefined, MethodRecord | undefined] = [methodA, methodB]
  const visibleMethods = displayedMethods(availableMethods, compareAll, pair, extraIds)
  const addableMethods = availableMethods.filter((method) => !visibleMethods.some((visible) => visible.methodId === method.methodId))

  useEffect(() => {
    setFrameIndex(0)
    setPlaying(false)
    setOutputModes({})
  }, [activeCase?.id, mode])
  useEffect(() => {
    if (!playing || frames.length < 2) return
    const current = frames[frameIndex]
    const next = frames[(frameIndex + 1) % frames.length]
    const currentTime = finite(current?.timestampMs)
    const nextTime = finite(next?.timestampMs)
    const baseDelay = currentTime !== undefined && nextTime !== undefined ? Math.max(50, nextTime - currentTime) : 180
    const timer = window.setTimeout(() => {
      if (frameIndex + 1 >= frames.length && !loop) setPlaying(false)
      else setFrameIndex((index) => (index + 1) % frames.length)
    }, baseDelay / speed)
    return () => window.clearTimeout(timer)
  }, [playing, frameIndex, frames, loop, speed])

  const setOutputMode = (methodId: string, next: OutputMode) => setOutputModes((current) => ({ ...current, [methodId]: next }))
  const caseName = activeCase?.label ?? 'No visual case selected'
  const caseMetadata = [activeCase?.sourceId ?? activeCase?.source, caseTransform(activeCase), activeCase?.crop, caseSeverity(activeCase) !== undefined ? `severity ${String(caseSeverity(activeCase))}` : undefined].filter((value): value is string => typeof value === 'string' && value.length > 0)
  const deploymentBaselineIds = new Set(['segformer_b2', 'segformer_b2__pytorch_fp32'])
  const selectedDeploymentId = [initialMethodAId, initialMethodBId].find((id) => id && !deploymentBaselineIds.has(id))
  const selectedMethodLabel = selectedDeploymentId
    ? methods.find((method) => method.methodId === selectedDeploymentId)
      ? methodLabel(methods.find((method) => method.methodId === selectedDeploymentId))
      : selectedDeploymentId.match(/^segformer_(b[0-2])__(pytorch|inductor|tensorrt)_(fp32|bf16|fp16|int8)$/i)
        ? `SegFormer ${selectedDeploymentId.match(/^segformer_(b[0-2])__(pytorch|inductor|tensorrt)_(fp32|bf16|fp16|int8)$/i)![1].toUpperCase()} · ${selectedDeploymentId.match(/^segformer_(b[0-2])__(pytorch|inductor|tensorrt)_(fp32|bf16|fp16|int8)$/i)![2]} · ${selectedDeploymentId.match(/^segformer_(b[0-2])__(pytorch|inductor|tensorrt)_(fp32|bf16|fp16|int8)$/i)![3].toUpperCase()}`
        : 'Selected deployment condition'
    : undefined

  if (!cases.length) {
    const message = card.category === 'deployment'
      ? deploymentUnavailableText(methods, initialMethodAId, initialMethodBId)
      : kind === 'runtime'
        ? 'Timing is measured by the frozen runtime harness. No synchronized image output is exported as runtime evidence.'
        : 'Metric-specific visual cases are not exported for this metric.'
    return <section className="ev-panel" aria-label="Synchronized visual evidence"><div className="ev-empty" role="status">
      <span className="ev-empty-mark">◎</span><strong>{card.category === 'deployment' ? 'Deployment point evidence unavailable' : 'Visual evidence unavailable'}</strong><p>{message}</p>
      {selectedMethodLabel && card.category === 'deployment' && <small>Selected point: {selectedMethodLabel}</small>}
    </div></section>
  }

  if (!activeCase || !frame) return <section className="ev-panel" aria-label="Synchronized visual evidence"><div className="ev-empty" role="status">
    <strong>{mode === 'worst_case' ? 'No outcome-selected QC examples are exported.' : 'No representative visual cases are exported.'}</strong>
    {mode === 'worst_case' && <p>Outcome-selected QC examples are not representative of the validation population.</p>}
  </div></section>

  const chooseCase = (id: string) => {
    setCaseId(id)
    setFrameIndex(0)
    setPlaying(false)
  }

  const chooseMethod = (slot: 'A' | 'B', id: string) => {
    if (slot === 'A') {
      setMethodAId(id)
      if (id === methodB?.methodId && methodA) setMethodBId(methodA.methodId)
      onMethodsChange?.(id, id === methodB?.methodId && methodA ? methodA.methodId : methodB?.methodId ?? '')
    } else {
      setMethodBId(id)
      if (id === methodA?.methodId && methodB) setMethodAId(methodB.methodId)
      onMethodsChange?.(id === methodA?.methodId && methodB ? methodB.methodId : methodA?.methodId ?? '', id)
    }
  }

  const updateFrame = (index: number) => {
    setFrameIndex(Math.max(0, Math.min(frames.length - 1, index)))
    setPlaying(false)
  }

  const transformOptions = [...new Set(filteredCases.map(caseTransform).filter((value): value is string => Boolean(value)))].sort()
  return <section className="ev-panel" aria-label="Synchronized visual comparison">
    <header className="ev-toolbar">
      <div className="ev-context"><span className="ev-kicker">SYNCHRONIZED EVIDENCE</span><h2>{caseName}</h2><p>{caseMetadata.join(' · ') || 'Source metadata unavailable'}</p></div>
      {cases.length > 1 && <div className="ev-selectors">
        <div className="ev-mode-switch" role="group" aria-label="Evidence case selection policy">
          <button type="button" className={mode === 'representative' ? 'selected' : ''} onClick={() => { setMode('representative'); setCaseId('') }}>Representative</button>
          <button type="button" className={mode === 'worst_case' ? 'selected' : ''} onClick={() => { setMode('worst_case'); setCaseId('') }}>Worst cases</button>
        </div>
        <label>CASE<select value={activeCase.id} onChange={(event) => chooseCase(event.target.value)}>
          {filteredCases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </div>}
    </header>
    {mode === 'worst_case' && <p className="ev-outcome-note"><strong>Outcome-selected QC examples</strong> — not representative. Representative anchors are source/reference selected without using predictions or errors.</p>}
    {activeCase.category === 'exact_gt' && transformOptions.length > 0 && <div className="ev-transform-controls">
      <label>TRANSFORM<select value={caseTransform(activeCase) ?? ''} onChange={(event) => {
        const selected = filteredCases.find((item) => caseTransform(item) === event.target.value)
        if (selected) chooseCase(selected.id)
      }}>{transformOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      {caseSeverity(activeCase) !== undefined && <span>SEVERITY <b>{String(caseSeverity(activeCase))}</b></span>}
      {activeCase.parameters && <small>{Object.entries(activeCase.parameters).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</small>}
    </div>}
    <div className="ev-method-bar">
      <label>METHOD A<select aria-label="Method A" value={methodA?.methodId ?? ''} onChange={(event) => chooseMethod('A', event.target.value)} disabled={!availableMethods.length}>
        {!availableMethods.length && <option value="">No method outputs</option>}{availableMethods.filter((method) => method.methodId !== methodB?.methodId).map((method) => <option key={method.methodId} value={method.methodId}>{methodLabel(method)}</option>)}
      </select></label>
      <label>METHOD B<select aria-label="Method B" value={methodB?.methodId ?? ''} onChange={(event) => chooseMethod('B', event.target.value)} disabled={!availableMethods.some((method) => method.methodId !== methodA?.methodId)}>
        {!methodB && <option value="">No second method output</option>}{availableMethods.filter((method) => method.methodId !== methodA?.methodId).map((method) => <option key={method.methodId} value={method.methodId}>{methodLabel(method)}</option>)}
      </select></label>
      <label className="ev-add-method">+ ADD METHOD<select aria-label="Add another method" value="" disabled={!addableMethods.length || compareAll} onChange={(event) => { if (event.target.value) setExtraIds((current) => [...current, event.target.value]) }}>
        <option value="">Choose method</option>{addableMethods.map((method) => <option key={method.methodId} value={method.methodId}>{methodLabel(method)}</option>)}
      </select></label>
      {extraIds.length > 0 && !compareAll && <button type="button" className="ev-clear-extra" onClick={() => setExtraIds([])}>Clear added methods</button>}
      {compareAll
        ? <button type="button" className="ev-view-switch" onClick={() => setCompareAll(false)}>Two-method view</button>
        : <button type="button" className="ev-view-switch" onClick={() => setCompareAll(true)}>Compare all <span>{availableMethods.length}</span></button>}
    </div>
    <div className="ev-transport">
      <div className="ev-step-controls">
        <button type="button" aria-label="Previous frame" onClick={() => updateFrame(frameIndex - 1)} disabled={frameIndex === 0}>‹</button>
        <button type="button" className="ev-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((value) => !value)} disabled={frames.length < 2}>{playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" aria-label="Next frame" onClick={() => updateFrame(frameIndex + 1)} disabled={frameIndex + 1 >= frames.length}>›</button>
      </div>
      <Timeline frame={frame} length={frames.length} index={frameIndex} onChange={updateFrame} />
      <label className="ev-speed">SPEED<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
      <label className="ev-loop"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
    </div>
    {kind === 'risk' && <RiskCurve card={card} methods={methods} selectedId={riskMethodId} onMethodChange={setRiskMethodId} />}
    {kind === 'coverage' && <CoverageTimeline item={activeCase} methods={visibleMethods} frameIndex={frameIndex} onChange={updateFrame} />}
    <div className="ev-grid-heading"><strong>{compareAll ? 'ALL METHODS' : 'SAME-FRAME COMPARISON'}</strong><span>Same source frame and crop · time shown when exported</span></div>
    <FrameMethodPair methods={visibleMethods} activeCase={activeCase} frame={frame} gt={gt} kind={kind} identities={identities} modeByMethod={outputModes} onModeChange={setOutputMode} caseCategory={activeCase.category} />
    {kind === 'temporal' && <TemporalTraces item={activeCase} methods={visibleMethods} identities={identities} frameIndex={frameIndex} />}
    <div className="ev-overlay-legend" aria-label="Overlay legend"><span><i className="ev-legend-gt" />{activeCase.category === 'temporal' || activeCase.category === 'exact_gt' ? 'Exact known reference geometry' : 'Human reference geometry'}</span>{visibleMethods.map((method) => <span key={method.methodId}><i style={{ background: fixedMethodColor(method.methodId, method.family) }} />{methodLabel(method)}</span>)}{kind === 'center' && <span><i className="ev-legend-vector" />Displayed center displacement</span>}</div>
  </section>
}
