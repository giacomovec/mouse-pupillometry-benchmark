import { normalizeVisualCase } from './data'
import type { MetricCard, VisualCase } from './types'

export type RouteId = 'overview' | 'published-method-benchmark' | 'robustness-time' | 'segformer-deployment' | 'methods-data'

export interface SourceRef {
  file?: string
  path?: string
  sha256?: string
  rowId?: string
  row?: string | number
  [key: string]: unknown
}

export interface ValidationCondition {
  conditionId: string
  methodId?: string
  label?: string
  family?: string
  model?: string
  representation?: string
  operatingPoint?: string
  backend?: string
  precision?: string
  coverage?: number
  accepted?: number
  attempted?: number
  metrics?: Record<string, unknown>
  sourceRefs?: SourceRef[]
  [key: string]: unknown
}

export interface OverviewExport {
  schema?: string
  status?: Record<string, unknown>
  population?: Record<string, unknown>
  statements?: Array<{ id: string; textTemplate: string; sourceRefs: SourceRef[]; claims?: Array<Record<string, unknown>> }>
  figures?: {
    accuracyCoverage?: Array<Record<string, unknown>>
    pairedArchitecture?: Array<Record<string, unknown>>
    practicalCoverage?: Array<Record<string, unknown>>
    commonSpeedAccuracy?: Array<Record<string, unknown>>
  }
  [key: string]: unknown
}

export interface ValidationExport {
  conditions: ValidationCondition[]
  [key: string]: unknown
}

export interface ExactSeverityRow {
  id: string
  methodId: string
  method: string
  operationFamily: string
  severity: string | number
  severityField: string
  severityValue?: number | string
  value: number | null
  accepted: number
  attempted: number
  coverage: number
  status?: string
  caseIds: string[]
  sourceRefs: SourceRef[]
}

export interface ExactSeverityExport {
  schema: string
  caseCount: number
  operationFamilies: string[]
  methodIds: string[]
  rows: ExactSeverityRow[]
  severityPolicy: Record<string, string>
  aggregationPolicy: string
}

export interface NativeCpuRuntimeExport {
  schema: string
  comparableToCommonA5000: boolean
  hardware: { machine: string; platform: string }
  sharedStreamSamples: number
  conditions: Array<{
    conditionId: string
    methodId: string
    method: string
    endToEndP50Ms: number
    endToEndP95Ms: number
    endToEndP99Ms: number
    initializationMs: number
    ramPeakDeltaBytes: number
    nativeParityMode: string
    statefulCondition: string
    sourceRefs: SourceRef[]
  }>
  excludedMethods: Array<{ methodId: string; status: string; reason: string }>
}

export interface CaseIndexEntry {
  id: string
  label?: string
  mode?: string
  category?: string
  metricIds?: string[]
  perturbationType?: string
  severity?: string | number
  file?: string
  [key: string]: unknown
}

const cache = new Map<string, Promise<unknown>>()

export function dataUrl(name: string) {
  return `${import.meta.env.BASE_URL}data/${name}`
}

export function getJson<T>(name: string): Promise<T> {
  let cached = cache.get(name)
  if (!cached) {
    cached = fetch(dataUrl(name)).then((response) => {
      if (!response.ok) throw new Error(`${name}: ${response.status}`)
      return response.json() as Promise<T>
    }).catch((error) => {
      cache.delete(name)
      throw error
    })
    cache.set(name, cached)
  }
  return cached as Promise<T>
}

export function getCards(name: string): Promise<MetricCard[]> {
  return getJson<{ cards?: MetricCard[] }>(name).then((value) => value.cards ?? [])
}

export async function getCase(index: CaseIndexEntry): Promise<VisualCase> {
  const file = index.file ?? `cases/${encodeURIComponent(index.id)}.json`
  const raw = await getJson<VisualCase | { case: VisualCase }>(file)
  return normalizeVisualCase(('case' in raw ? raw.case : raw) as VisualCase)
}

export function setSharedState(patch: Record<string, string | undefined>) {
  const url = new URL(window.location.href)
  Object.entries(patch).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key))
  window.history.replaceState(null, '', url)
}
