import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CENTER_REFERENCE_NOTE, centerEvidenceNumbers, scoreReadout } from '../src/EvidenceViewer'

type EvidenceCaseFile = { cases: Array<{ id: string; frames: Array<Record<string, unknown>> }> }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

describe('center evidence provenance', () => {
  it('keeps the visible human-reference mask distance distinct from the frozen score-plane error', () => {
    const file = JSON.parse(readFileSync(new URL('../public/data/visual_cases.json', import.meta.url), 'utf8')) as EvidenceCaseFile
    const item = file.cases.find((candidate) => candidate.id === 'Raffaele__20181028_134237_CNNdataset_b00_frame_107.png')
    const frame = item?.frames.find((candidate) => candidate.sourceFrameNumber === 107)
    const reference = asRecord(frame?.reference)
    const gt = asRecord(reference?.geometry) ?? reference
    const methods = asRecord(frame?.methods)
    const method = asRecord(methods?.segformer_b2)
    const scored = asRecord(method?.geometry) ?? method
    const gtCenter = asRecord(gt?.center)
    const predictionCenter = asRecord(scored?.center)
    expect(gtCenter).toBeDefined()
    expect(predictionCenter).toBeDefined()

    const result = centerEvidenceNumbers(
      { x: gtCenter!.x as number, y: gtCenter!.y as number },
      { x: predictionCenter!.x as number, y: predictionCenter!.y as number },
      scored?.errorPx as number,
    )

    expect(result.displayedDistance).toBeCloseTo(0.2491839, 6)
    expect(result.scorePlaneError).toBeCloseTo(0.2515339559765779, 9)
    expect(result.difference).toBeCloseTo(0.0023500445754468, 9)
    expect(CENTER_REFERENCE_NOTE).toContain('centroid of the exported human-reference mask')
    expect(CENTER_REFERENCE_NOTE).toContain('score row’s true_center_x/y reference')
    expect(CENTER_REFERENCE_NOTE).toContain('centroid_error_px')
  })
})

describe('score-plane units', () => {
  it('renders relative errors as percentages and geometric distances as pixels', () => {
    expect(scoreReadout({ name: 'diameter_are', value: 0.012645398072382429 })).toEqual(['Frozen diameter ARE', '1.26%'])
    expect(scoreReadout({ name: 'area_are', value: 0.025130890052356022 })).toEqual(['Frozen area ARE', '2.51%'])
    expect(scoreReadout({ name: 'center_error_px', value: 0.523117601729875 })).toEqual(['Frozen center error', '0.5231 px'])
  })
})
