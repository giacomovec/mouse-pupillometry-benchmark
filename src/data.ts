import type {
  BenchmarkData,
  BenchmarkManifest,
  CapabilityFile,
  CapabilityMethod,
  CategoryId,
  FrameGeometry,
  MethodIdentity,
  MetricCard,
  MetricFile,
  VisualCase,
} from './types'

const files: Array<[CategoryId, string]> = [
  ['real_validation', 'real_validation.json'],
  ['geometry', 'geometry.json'],
  ['segmentation', 'segmentation.json'],
  ['coverage_risk', 'coverage_risk.json'],
  ['exact_gt', 'exact_gt.json'],
  ['temporal', 'temporal.json'],
  ['runtime', 'runtime.json'],
  ['deployment', 'deployment.json'],
  ['capabilities', 'capabilities.json'],
]

function dataUrl(name: string): string {
  return new URL(`${import.meta.env.BASE_URL}data/${name}`, window.location.href).toString()
}

async function readJson<T>(name: string): Promise<T> {
  const response = await fetch(dataUrl(name), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

function cards(file: MetricFile): MetricCard[] {
  return file.cards ?? file.metrics ?? []
}

function capabilityMatrixFromCards(items: MetricCard[]) {
  return items.map((card) => {
    const provenance = card.provenance ?? {}
    return {
      id: card.id,
      name: card.title ?? card.label ?? card.id,
      description: card.explanation ?? (typeof provenance.description === 'string' ? provenance.description : undefined),
      whyItMatters: typeof provenance.whyItMatters === 'string' ? provenance.whyItMatters : undefined,
      capabilityType: typeof provenance.capabilityType === 'string' ? provenance.capabilityType : undefined,
      methods: (card.methods ?? []).map((method): CapabilityMethod => {
        const evidence = method.provenance ?? {}
        return {
          methodId: method.methodId,
          methodName: method.methodName ?? method.label ?? method.name,
          family: method.family,
          color: method.color,
          nativeSupport: method.capabilitySupport,
          implementedInOurBenchmark: method.implementedInOurBenchmark,
          validatedInOurBenchmark: method.validatedInOurBenchmark,
          evidenceSource: typeof evidence.evidenceSource === 'string' ? evidence.evidenceSource : undefined,
          notes: typeof evidence.notes === 'string' ? evidence.notes : undefined,
        }
      }),
    }
  })
}

export function normalizeVisualCase(item: VisualCase): VisualCase {
  const normalizedFrames = (item.frames ?? []).map((sourceFrame, index) => {
    const frame = { ...sourceFrame } as typeof sourceFrame & Record<string, unknown>
    const sourceReference = frame.reference as Record<string, unknown> | undefined
    if (sourceReference) {
      if (typeof sourceReference.src === 'string') frame.sourceSrc = sourceReference.src
      const gt = sourceReference.gt
      const gtGeometry = sourceReference.geometry ?? sourceReference.gtGeometry
      if (gtGeometry && typeof gtGeometry === 'object') frame.reference = { ...sourceReference, ...gtGeometry } as typeof frame.reference
      else if (gt && typeof gt === 'object') frame.reference = { ...sourceReference, ...gt } as typeof frame.reference
      else if (typeof gt === 'string') frame.reference = { ...sourceReference, mask: sourceReference.mask ?? gt } as typeof frame.reference
    }
    const source = frame.source && typeof frame.source === 'object' ? frame.source as Record<string, unknown> : undefined
    if (typeof source?.src === 'string' && !frame.sourceSrc) frame.sourceSrc = source.src
    if (typeof source?.width === 'number' && !frame.width) frame.width = source.width
    if (typeof source?.height === 'number' && !frame.height) frame.height = source.height
    const sourceMethods = frame.methods as Record<string, unknown> | undefined
    if (sourceMethods) {
      frame.methods = Object.fromEntries(Object.entries(sourceMethods).map(([id, raw]) => {
        const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
        const prediction = value.prediction && typeof value.prediction === 'object' ? value.prediction as Record<string, unknown> : {}
        const geometry = value.geometry && typeof value.geometry === 'object' ? value.geometry as Record<string, unknown> : {}
        const merged = {
          ...value,
          ...prediction,
          ...geometry,
          accepted: value.accepted ?? geometry.accepted ?? prediction.accepted,
          confidence: value.confidence ?? geometry.confidence ?? prediction.confidence,
          threshold: value.threshold ?? geometry.threshold ?? prediction.threshold,
          rejectionReason: value.rejectionReason ?? geometry.rejectionReason ?? prediction.rejectionReason,
        }
        return [id, merged as FrameGeometry]
      })) as typeof frame.methods
    }
    if (typeof frame.frameIndex !== 'number') frame.frameIndex = index
    return frame
  })
  return { ...item, frames: normalizedFrames }
}

export async function loadBenchmarkData(): Promise<BenchmarkData> {
  const loadErrors: string[] = []
  const safeRead = async <T,>(name: string, fallback: T): Promise<T> => {
    try {
      return await readJson<T>(name)
    } catch (error) {
      loadErrors.push(error instanceof Error ? error.message : String(error))
      return fallback
    }
  }

  const [manifest, methodsFile, visualFile, provenance, metricFiles] = await Promise.all([
    safeRead<BenchmarkManifest>('benchmark_manifest.json', {}),
    safeRead<{ methods?: MethodIdentity[]; variants?: MethodIdentity[] } | MethodIdentity[]>('methods.json', []),
    safeRead<{ cases?: VisualCase[] } | VisualCase[]>('visual_cases.json', []),
    safeRead<Record<string, unknown>>('provenance.json', {}),
    Promise.all(
      [...new Set(files.map(([, file]) => file))].map(async (name) => [
        name,
        await safeRead<MetricFile | CapabilityFile>(name, {}),
      ] as const),
    ),
  ])

  const byFile = new Map(metricFiles)
  const capabilityExport = (byFile.get('capabilities.json') ?? {}) as CapabilityFile
  const capabilityMatrix = capabilityExport.matrix ?? capabilityMatrixFromCards(cards(capabilityExport))
  const categoryCards = Object.fromEntries(
    files.map(([category, file]) => [category, cards(byFile.get(file) ?? {})]),
  ) as Record<CategoryId, MetricCard[]>

  // Compatibility path for a single-file real-validation export.
  const allRealCards = cards(byFile.get('real_validation.json') ?? {})
  categoryCards.real_validation = allRealCards.filter((card) =>
    !['geometry', 'segmentation', 'coverage_risk', 'coverage', 'risk_coverage'].includes(String(card.category ?? '')),
  )
  // Capability definitions are categorical and are rendered in the matrix, never as metric charts.
  categoryCards.capabilities = []
  if (!categoryCards.geometry.length && !categoryCards.segmentation.length && !categoryCards.coverage_risk.length) {
    categoryCards.geometry = allRealCards.filter((card) => card.category === 'geometry')
    categoryCards.segmentation = allRealCards.filter((card) => card.category === 'segmentation')
    categoryCards.coverage_risk = allRealCards.filter((card) =>
      card.category === 'coverage_risk' || card.category === 'coverage' || card.category === 'risk_coverage',
    )
  }

  return {
    manifest,
    methods: Array.isArray(methodsFile) ? methodsFile : methodsFile.variants ?? methodsFile.methods ?? [],
    visualCases: (Array.isArray(visualFile) ? visualFile : visualFile.cases ?? []).map(normalizeVisualCase),
    provenance,
    cardsByCategory: categoryCards,
    capabilityMatrix,
    loadErrors,
  }
}

export function findVisualCases(data: BenchmarkData, card: MetricCard, mode: 'representative' | 'worst_case') {
  const ids = card.visualCaseIds
  const expectedCategory = card.category === 'geometry' || card.category === 'segmentation' || card.category === 'coverage_risk'
    ? 'real_validation'
    : card.category
  return data.visualCases.filter((item) => {
    const matchesMode = mode === 'representative'
      ? item.representative === true || item.mode === 'representative' || (!item.outcomeSelected && item.mode !== 'worst_case')
      : item.outcomeSelected === true || item.mode === 'worst_case' || item.kind === 'worst_case'
    const matchesCard = !ids?.length || ids.includes(item.id)
    const matchesMetric = !item.metricIds?.length || item.metricIds.includes(card.id)
    const matchesCategory = !expectedCategory || item.category === expectedCategory
    return matchesMode && matchesCard && matchesMetric && matchesCategory
  })
}
