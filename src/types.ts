export type CategoryId =
  | 'real_validation'
  | 'geometry'
  | 'segmentation'
  | 'coverage_risk'
  | 'exact_gt'
  | 'temporal'
  | 'runtime'
  | 'deployment'
  | 'capabilities'

export type Direction = 'lower' | 'higher' | 'target' | 'descriptive' | string

export interface MethodRecord {
  methodId: string
  id?: string
  label?: string
  methodName?: string
  name?: string
  family?: string
  familyId?: string
  architecture?: string
  variant?: string
  representation?: string
  representationId?: string
  operatingPoint?: string
  backend?: string
  precision?: string
  deployment?: string
  color?: string
  familyColor?: string
  colorKey?: string
  canonical?: boolean
  isCanonical?: boolean
  value?: number | string | boolean | null
  valueText?: string
  capabilitySupport?: string
  implementedInOurBenchmark?: boolean | string
  validatedInOurBenchmark?: boolean | string
  unit?: string
  n?: number | null
  acceptedCount?: number | null
  totalCount?: number | null
  unavailableReason?: string
  uncertainty?: number | null
  lower?: number | null
  upper?: number | null
  errorLow?: number | null
  errorHigh?: number | null
  interval?: [number, number] | null
  unavailable?: boolean
  status?: string
  checkpointHash?: string
  scoreManifestHash?: string
  runtimeProtocol?: string
  perSeed?: Array<{ seedId?: string | number; seed?: string | number; value?: number | null; unit?: string; status?: string; [key: string]: unknown }>
  riskCoverage?: Array<{ threshold: number | null; thresholdLabel?: string; coverage: number; risk: number; retained?: number; attempted?: number; [key: string]: unknown }>
  provenance?: Record<string, unknown>
  visualCaseIds?: string[]
  [key: string]: unknown
}

export interface MetricCard {
  id: string
  title: string
  label?: string
  category?: string
  explanation?: string
  description?: string
  direction?: Direction
  unit?: string
  metric?: string
  metricId?: string
  overlayType?: string
  sourcePopulation?: string
  canonicalCondition?: string
  source?: string
  n?: number | null
  acquisitionFamilies?: string[]
  representation?: string
  operatingThreshold?: number | string | null
  benchmarkVersion?: string
  freeze?: string
  runtimeProtocol?: string
  methods?: MethodRecord[]
  visualCaseIds?: string[]
  provenance?: Record<string, unknown>
  riskCoverage?: Array<{ threshold: number; coverage: number; risk: number }>
  [key: string]: unknown
}

export interface MetricFile {
  cards?: MetricCard[]
  metrics?: MetricCard[]
  [key: string]: unknown
}

export interface CapabilityMethod {
  methodId: string
  methodName?: string
  family?: string
  color?: string
  nativeSupport?: string | boolean | null
  implementedInOurBenchmark?: string | boolean | null
  validatedInOurBenchmark?: string | boolean | null
  evidenceSource?: string | null
  notes?: string | null
  [key: string]: unknown
}

export interface CapabilityDefinition {
  id: string
  name: string
  description?: string
  whyItMatters?: string
  capabilityType?: string
  methods: CapabilityMethod[]
  [key: string]: unknown
}

export interface CapabilityFile extends MetricFile {
  matrix?: CapabilityDefinition[]
}

export interface Point {
  x: number
  y: number
}

export interface Ellipse {
  cx: number
  cy: number
  rx?: number
  ry?: number
  a?: number
  b?: number
  major?: number
  minor?: number
  diameter?: number
  rotation?: number
  orientationDeg?: number
  angleRad?: number
  majorAxis?: [Point, Point]
  minorAxis?: [Point, Point]
  diameterLine?: [Point, Point]
  [key: string]: unknown
}

export interface MaskOverlay {
  src?: string
  url?: string
  boundary?: string
  contour?: string
}

export interface FrameGeometry {
  image?: string
  src?: string
  frameSrc?: string
  mask?: string | MaskOverlay
  predictionMask?: string | MaskOverlay
  maskSrc?: string
  maskComparison?: { src: string; sha256?: string; legend?: Record<string, string> }
  boundary?: string
  boundarySrc?: string
  distanceFieldSrc?: string
  center?: Point
  ellipse?: Ellipse
  axes?: { major?: [Point, Point]; minor?: [Point, Point] }
  orientationDeg?: number
  diameter?: number
  area?: number
  accepted?: boolean
  confidence?: number
  threshold?: number
  rejectionReason?: string
  value?: number
  signedDifference?: number
  relativeError?: number
  errorPx?: number
  residual?: number
  falsePositiveArea?: number
  falseNegativeArea?: number
  orientationAvailable?: boolean
  diameterLine?: [Point, Point]
  majorSignedDifference?: number
  minorSignedDifference?: number
  riskCoverage?: Array<{ threshold: number; accepted: boolean; coverage?: number; risk?: number }>
  [key: string]: unknown
}

export interface VisualFrame {
  frameIndex: number
  sourceFrameNumber?: number
  timestampMs?: number
  timeMs?: number
  width?: number
  height?: number
  sourceSrc?: string
  sourceId?: string
  perturbation?: string
  crop?: string
  reference?: FrameGeometry
  gt?: FrameGeometry
  methods?: Record<string, FrameGeometry>
  temporal?: Array<{ timeMs: number; gt?: number; prediction?: number; residual?: number }>
  [key: string]: unknown
}

export interface VisualCase {
  id: string
  label: string
  mode?: 'representative' | 'worst_case' | string
  kind?: string
  representative?: boolean
  outcomeSelected?: boolean
  category?: string
  metricIds?: string[]
  sourceId?: string
  sourceHash?: string
  originalSourceSrc?: string
  perturbationType?: string
  severity?: number | string
  severityValue?: number | string
  parameters?: Record<string, unknown>
  perturbation?: string
  crop?: string
  frames?: VisualFrame[]
  frameIds?: number[]
  source?: string
  [key: string]: unknown
}

export interface MethodIdentity {
  methodId: string
  id?: string
  label?: string
  name?: string
  familyId?: string
  family?: string
  color?: string
  familyColor?: string
  colorKey?: string
  variantId?: string
  representation?: string
  isCanonical?: boolean
  nativeOrMatched?: string
  architecture?: string
  [key: string]: unknown
}

export interface BenchmarkManifest {
  version?: string
  freeze?: string
  status?: string | Record<string, unknown>
  generatedAt?: string
  cardCount?: number
  visualCaseCount?: number
  files?: Record<string, unknown>
  gates?: Record<string, unknown>
  [key: string]: unknown
}

export interface BenchmarkData {
  manifest: BenchmarkManifest
  methods: MethodIdentity[]
  visualCases: VisualCase[]
  provenance: Record<string, unknown>
  cardsByCategory: Record<CategoryId, MetricCard[]>
  capabilityMatrix: CapabilityDefinition[]
  loadErrors: string[]
}
