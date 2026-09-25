import { describe, expect, it } from 'vitest'
import overview from '../public/data/overview_v2.json'
import validation from '../public/data/real_validation_v2.json'
import deployment from '../public/data/deployment.json'

const primaryIds = new Set([
  'segformer_b0', 'segformer_b1', 'segformer_b2', 'meye_released',
  'standard_dlc_matched', 'pupil_dlc_gm', 'dlc_zoo_mouse_pupil_vclose',
  'neuropupil_animal', 'mouse_pupil_analysis_v020', 'classical_fixed',
])

describe('v2 published benchmark integrity', () => {
  it('retains every admitted primary technique and separates architecture controls', () => {
    const primary = validation.conditions.filter((row) => row.primary)
    expect(new Set(primary.map((row) => row.methodId))).toEqual(primaryIds)
    expect(overview.figures.accuracyCoverage.every((point) => !point.id.includes('unet'))).toBe(true)
    expect(overview.figures.practicalCoverage.every((point) => !point.id.includes('unet'))).toBe(true)
    expect(overview.figures.pairedArchitecture.map((row) => row.id)).toEqual(['unet_small', 'unet_base', 'unet_b2_matched'])
  })

  it('shows native and prospective 95% keypoint conditions separately', () => {
    for (const id of ['standard_dlc_matched', 'pupil_dlc_gm']) {
      const points = overview.figures.accuracyCoverage.filter((point) => point.id.startsWith(id))
      expect(points).toHaveLength(2)
      expect(new Set(points.map((point) => point.connectionId)).size).toBe(1)
      expect(points[0].coveragePercent).not.toBe(points[1].coveragePercent)
    }
  })

  it('uses bounded, populated coverage and source-bound score planes', () => {
    for (const row of validation.conditions) {
      if (row.coveragePercent !== null) expect(row.coveragePercent).toBeGreaterThanOrEqual(0)
      if (row.coveragePercent !== null) expect(row.coveragePercent).toBeLessThanOrEqual(100)
      expect(row.plane).toBeTruthy()
      expect(row.sourceRefs.length).toBeGreaterThan(0)
      expect(row.sourceRefs.every((ref) => ref.path && ref.sha256)).toBe(true)
    }
    expect(overview.safety.allenModelScoring).toBe(0)
    expect(overview.safety.legacyProtectedInferenceQueries).toBe(0)
  })

  it('preserves the measured B2-matched U-Net paired uncertainty', () => {
    const paired = overview.figures.pairedArchitecture.find((row) => row.id === 'unet_b2_matched')
    expect(paired).toBeDefined()
    expect(paired!.differencePercentagePoints).toBeCloseTo(-1.1133815007670926, 6)
    expect(paired!.ciLow).toBeLessThan(0)
    expect(paired!.ciHigh).toBeGreaterThan(0)
  })

  it('keeps all executed INT8 conditions with failed coverage gates', () => {
    const coverage = deployment.cards.find((card) => card.id === 'deployment-coverage')!
    const int8 = coverage.methods.filter((method) => method.precision === 'INT8')
    expect(int8).toHaveLength(3)
    expect(int8.every((method) => method.status === 'FAIL COVERAGE' && method.value !== null)).toBe(true)
  })
})
