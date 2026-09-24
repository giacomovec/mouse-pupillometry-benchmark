import { describe, expect, it } from 'vitest'
import { findVisualCases, normalizeVisualCase } from '../src/data'
import { orderedMethods } from '../src/MetricChart'
import { getEllipse } from '../src/EvidenceViewer'
import { metricMethods } from '../src/MetricCardView'
import type { BenchmarkData, MethodRecord, MetricCard, VisualCase } from '../src/types'

const methods: MethodRecord[] = [
  { methodId: 'gamma', value: 3 },
  { methodId: 'alpha', value: 1 },
  { methodId: 'beta', value: 2 },
  { methodId: 'unavailable', value: null, unavailable: true },
]

const card: MetricCard = { id: 'fixture', title: 'Synthetic fixture metric', category: 'real_validation', direction: 'lower', unit: 'px' }

describe('benchmark chart method order', () => {
  it('sorts lower-is-better values from best to worst and puts missing entries after measured values', () => {
    expect(orderedMethods(card, methods, [], 'best').map((method) => method.methodId))
      .toEqual(['alpha', 'beta', 'gamma', 'unavailable'])
  })

  it('reverses ranking for higher-is-better metrics', () => {
    expect(orderedMethods({ ...card, direction: 'higher' }, methods, [], 'best').map((method) => method.methodId))
      .toEqual(['gamma', 'beta', 'alpha', 'unavailable'])
  })

  it('ranks signed zero-target differences by distance from zero', () => {
    const signed = [
      { methodId: 'negative', value: -2 },
      { methodId: 'near-zero', value: 0.1 },
      { methodId: 'positive', value: 1 },
    ]
    expect(orderedMethods({ ...card, direction: 'target' }, signed, [], 'best').map((method) => method.methodId))
      .toEqual(['near-zero', 'positive', 'negative'])
  })

  it('keeps the canonical registry order when requested', () => {
    const identities = ['beta', 'alpha', 'gamma'].map((methodId) => ({ methodId }))
    expect(orderedMethods(card, methods, identities, 'registry').map((method) => method.methodId))
      .toEqual(['beta', 'alpha', 'gamma', 'unavailable'])
  })
})

describe('visual case selection', () => {
  it('keeps representative and outcome-selected cases in separate modes and honors card IDs', () => {
    const cases: VisualCase[] = [
      { id: 'rep-one', label: 'Representative', category: 'real_validation', mode: 'representative', metricIds: ['fixture'] },
      { id: 'worst-one', label: 'Outcome selected', category: 'real_validation', mode: 'worst_case', metricIds: ['fixture'] },
      { id: 'other-metric', label: 'Other metric', category: 'real_validation', mode: 'representative', metricIds: ['other'] },
      { id: 'unrelated', label: 'Unrelated spatial case', category: 'exact_gt', mode: 'representative' },
    ]
    const data = {
      visualCases: cases,
    } as BenchmarkData
    expect(findVisualCases(data, card, 'representative').map((item) => item.id)).toEqual(['rep-one'])
    expect(findVisualCases(data, card, 'worst_case').map((item) => item.id)).toEqual(['worst-one'])
  })
})

describe('source-pixel Exact-GT overlays', () => {
  it('converts canonical ellipse radians to SVG degrees without suppressing orientation', () => {
    const ellipse = getEllipse({ ellipse: { cx: 12, cy: 15, rx: 7, ry: 3, angleRad: Math.PI / 2 } })
    expect(ellipse?.rotation).toBeCloseTo(90)
    expect(ellipse?.orientationAvailable).toBe(true)
  })

  it('retains frozen source, GT, and prediction-mask assets through data loading', () => {
    const normalized = normalizeVisualCase({
      id: 'exact-case', category: 'exact_gt',
      frames: [{
        frameIndex: 0, sourceSrc: '/media/transformed.png', originalSourceSrc: '/media/original.png',
        reference: { src: '/media/transformed.png', mask: { src: '/media/gt.png' }, geometry: { diameter: 23 } },
        methods: { model: { predictionMask: '/media/prediction.png', geometry: { diameter: 21 } } },
      }],
    } as VisualCase)
    const frame = normalized.frames?.[0]
    expect(frame?.originalSourceSrc).toBe('/media/original.png')
    expect(frame?.reference?.mask).toEqual({ src: '/media/gt.png' })
    expect(frame?.reference?.diameter).toBe(23)
    expect(frame?.methods?.model.predictionMask).toBe('/media/prediction.png')
    expect(frame?.methods?.model.diameter).toBe(21)
  })
})

describe('deployment conditions', () => {
  it('keeps noncanonical backend and precision conditions visible within deployment cards', () => {
    const deploymentCard: MetricCard = {
      id: 'deployment-latency', title: 'Latency', category: 'deployment',
      methods: [
        { methodId: 'b2-fp32', canonical: true, backend: 'PyTorch', precision: 'FP32', value: 28 },
        { methodId: 'b2-int8', canonical: false, backend: 'TensorRT', precision: 'INT8', value: 12, status: 'FAIL COVERAGE' },
      ],
    }
    expect(metricMethods(deploymentCard, { representations: false, deployments: false }).map((method) => method.methodId))
      .toEqual(['b2-fp32', 'b2-int8'])
  })
})
