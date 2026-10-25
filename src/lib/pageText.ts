import type { PdfPage } from '../types/pdf'

export const DEFAULT_TEXT_SIZE = 16
export const MIN_TEXT_SIZE = 6
export const MAX_TEXT_SIZE = 120
export const TEXT_LINE_HEIGHT = 1.2
export const TEXT_COLORS = ['#111111', '#d92d20', '#1d4ed8', '#15803d', '#a16207', '#ffffff']

const isSideways = (rotation: number) => Math.round(rotation / 90) % 2 !== 0

// The page's unrotated size in points: width and height swap back when the page is turned a quarter.
export function frameSizePt(page: Pick<PdfPage, 'width' | 'height' | 'rotation'>) {
  return isSideways(page.rotation)
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height }
}

// A frame-sized box (the page unrotated) laid over a displayed area of width x height that shows the page turned by `rotation`.
export function frameLayout(rotation: number, width: number, height: number) {
  const turn = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360
  const sideways = turn === 90 || turn === 270
  const transform =
    turn === 90
      ? `translate(${width}px, 0) rotate(90deg)`
      : turn === 180
        ? `translate(${width}px, ${height}px) rotate(180deg)`
        : turn === 270
          ? `translate(0, ${height}px) rotate(270deg)`
          : 'none'
  return {
    width: sideways ? height : width,
    height: sideways ? width : height,
    transform,
    turn,
  }
}

// Maps a movement on screen back into the unrotated frame.
export function screenToFrame(turn: number, dx: number, dy: number) {
  if (turn === 90) return { x: dy, y: -dx }
  if (turn === 180) return { x: -dx, y: -dy }
  if (turn === 270) return { x: -dy, y: dx }
  return { x: dx, y: dy }
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

// Turns a vector clockwise on screen (y points down).
function rotateVector(x: number, y: number, degrees: number) {
  const angle = toRadians(degrees)
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) }
}

export const normalizeDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180

// Boxes pivot on their top-left corner. To make one look like it turns about its centre, the corner moves to compensate.
export function rotateAboutCentre(
  box: { x: number; y: number; rotation?: number },
  rotation: number,
  boxSize: { width: number; height: number },
  frameSize: { width: number; height: number },
) {
  const half = { x: boxSize.width / 2, y: boxSize.height / 2 }
  const before = rotateVector(half.x, half.y, box.rotation ?? 0)
  const centre = { x: box.x * frameSize.width + before.x, y: box.y * frameSize.height + before.y }
  const after = rotateVector(half.x, half.y, rotation)
  return {
    x: (centre.x - after.x) / frameSize.width,
    y: (centre.y - after.y) / frameSize.height,
    rotation: normalizeDegrees(rotation),
  }
}
