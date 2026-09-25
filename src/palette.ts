/** Fixed method-family colors used across charts and evidence views. */
export const METHOD_PALETTE = {
  segformerB0: '#91c8f4',
  segformerB1: '#4d91d2',
  segformerB2: '#173c74',
  meye: '#df7d36',
  dlc: '#8064a2',
  pupilDlc: '#c65383',
  neuroPupil: '#4f8c5e',
  mousePupilAnalysis: '#aa7937',
  classical: '#7c8388',
  unet: '#78869a',
  other: '#657785',
} as const

export function methodColor(methodId = '', family = ''): string {
  const key = `${methodId} ${family}`.toLowerCase().replaceAll('-', '_')
  if (key.includes('segformer_b0')) return METHOD_PALETTE.segformerB0
  if (key.includes('segformer_b1')) return METHOD_PALETTE.segformerB1
  if (key.includes('segformer_b2')) return METHOD_PALETTE.segformerB2
  if (key.includes('segformer')) return METHOD_PALETTE.segformerB1
  if (key.includes('pupil_dlc')) return METHOD_PALETTE.pupilDlc
  if (key.includes('meye')) return METHOD_PALETTE.meye
  if (key.includes('deeplabcut') || key.includes('dlc')) return METHOD_PALETTE.dlc
  if (key.includes('neuropupil')) return METHOD_PALETTE.neuroPupil
  if (key.includes('mouse_pupil_analysis')) return METHOD_PALETTE.mousePupilAnalysis
  if (key.includes('unet')) return METHOD_PALETTE.unet
  if (key.includes('classical') || key.includes('fixed_dark')) return METHOD_PALETTE.classical
  return METHOD_PALETTE.other
}

export function methodOrder(methodId = '', family = ''): number {
  const key = `${methodId} ${family}`.toLowerCase().replaceAll('-', '_')
  if (key.includes('segformer_b0')) return 0
  if (key.includes('segformer_b1')) return 1
  if (key.includes('segformer_b2')) return 2
  if (key.includes('meye')) return 10
  if (key.includes('standard_dlc') || key.includes('deeplabcut')) return 20
  if (key.includes('dlc_zoo')) return 21
  if (key.includes('pupil_dlc')) return 30
  if (key.includes('neuropupil')) return 50
  if (key.includes('mouse_pupil_analysis')) return 60
  if (key.includes('classical')) return 70
  if (key.includes('unet')) return 90
  return 80
}
