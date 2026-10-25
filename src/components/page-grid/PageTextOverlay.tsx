import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Move, RotateCw } from 'lucide-react'
import type { PageTextBox, PdfPage } from '../../types/pdf'
import {
  frameLayout,
  frameSizePt,
  normalizeDegrees,
  rotateAboutCentre,
  screenToFrame,
  TEXT_LINE_HEIGHT,
} from '../../lib/pageText'

interface FrameProps {
  page: Pick<PdfPage, 'width' | 'height' | 'rotation'>
  /** Rotation of the area the overlay sits in (a thumbnail shows the page at its first-rendered rotation). */
  displayRotation: number
  width: number
  height: number
}

const TEXT_FONT = 'Helvetica, Arial, sans-serif'

function boxStyle(box: PageTextBox, pxPerPt: number, frameWidth: number, frameHeight: number): CSSProperties {
  return {
    left: box.x * frameWidth,
    top: box.y * frameHeight,
    color: box.color,
    fontSize: box.fontSize * pxPerPt,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
  }
}

// Read-only text for thumbnails: the same frame math as the editor, with no interaction.
export function PageTextOverlay({
  boxes,
  page,
  displayRotation,
  width,
  height,
}: FrameProps & { boxes: PageTextBox[] }) {
  const layout = frameLayout(displayRotation, width, height)
  const pxPerPt = layout.width / frameSizePt(page).width
  return (
    <div
      className="page-text-frame is-static"
      aria-hidden="true"
      style={{ width: layout.width, height: layout.height, transform: layout.transform }}
    >
      {boxes.map((box) => (
        <div key={box.id} className="page-text-box" style={boxStyle(box, pxPerPt, layout.width, layout.height)}>
          {box.text}
        </div>
      ))}
    </div>
  )
}

interface PageTextEditorProps extends FrameProps {
  boxes: PageTextBox[]
  /** When on, clicking the page adds a text box. */
  isAdding: boolean
  selectedId: string | null
  focusId: string | null
  onAdd: (x: number, y: number) => void
  onSelect: (id: string | null) => void
  onTextChange: (id: string, text: string) => void
  /** `commit` saves straight away (one undo step) instead of waiting for the edit to finish. */
  onChange: (id: string, patch: Partial<Pick<PageTextBox, 'x' | 'y' | 'rotation'>>, commit?: boolean) => void
  /** Called when an edit is finished (blur or drag end) so it can be saved as one undo step. */
  onCommit: () => void
}

const DRAG_THRESHOLD_PX = 4

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function PageTextEditor({
  boxes,
  page,
  displayRotation,
  width,
  height,
  isAdding,
  selectedId,
  focusId,
  onAdd,
  onSelect,
  onTextChange,
  onChange,
  onCommit,
}: PageTextEditorProps) {
  const layout = frameLayout(displayRotation, width, height)
  const pxPerPt = layout.width / frameSizePt(page).width
  const dragRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null)
  const turnRef = useRef<{
    id: string
    box: PageTextBox
    size: { width: number; height: number }
    centre: { x: number; y: number }
    startAngle: number
    startPoint: { x: number; y: number }
    /** Stays false until the pointer travels far enough to count as a drag rather than a click. */
    moved: boolean
  } | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLElement>, box: PageTextBox) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: box.id, startX: event.clientX, startY: event.clientY, x: box.x, y: box.y }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = screenToFrame(layout.turn, event.clientX - drag.startX, event.clientY - drag.startY)
    onChange(drag.id, {
      x: clamp01(drag.x + delta.x / layout.width),
      y: clamp01(drag.y + delta.y / layout.height),
    })
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onCommit()
  }

  // Rotating follows the pointer around the box's centre; holding Shift snaps to 15 degrees.
  const startTurn = (event: ReactPointerEvent<HTMLElement>, box: PageTextBox) => {
    const element = event.currentTarget.closest<HTMLElement>('.page-text-box')
    if (!element) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = element.getBoundingClientRect()
    const centre = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    turnRef.current = {
      id: box.id,
      box,
      size: { width: element.offsetWidth, height: element.offsetHeight },
      centre,
      startAngle: Math.atan2(event.clientY - centre.y, event.clientX - centre.x),
      startPoint: { x: event.clientX, y: event.clientY },
      moved: false,
    }
  }

  const moveTurn = (event: ReactPointerEvent<HTMLElement>) => {
    const turn = turnRef.current
    if (!turn) return
    if (!turn.moved) {
      if (Math.hypot(event.clientX - turn.startPoint.x, event.clientY - turn.startPoint.y) < DRAG_THRESHOLD_PX) return
      turn.moved = true
    }
    const angle = Math.atan2(event.clientY - turn.centre.y, event.clientX - turn.centre.x)
    let rotation = (turn.box.rotation ?? 0) + ((angle - turn.startAngle) * 180) / Math.PI
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
    // Landing close to a right angle feels better than a degree or two off it.
    const nearest = Math.round(rotation / 90) * 90
    if (Math.abs(rotation - nearest) < 3) rotation = nearest
    onChange(turn.id, rotateAboutCentre(turn.box, normalizeDegrees(rotation), turn.size, layout))
  }

  // Turns a box a quarter clockwise about its centre.
  const quarterTurn = (box: PageTextBox, size: { width: number; height: number }) =>
    onChange(box.id, rotateAboutCentre(box, normalizeDegrees((box.rotation ?? 0) + 90), size, layout), true)

  // Releasing the handle without dragging is a click: turn the box 90 degrees.
  const endTurn = () => {
    const turn = turnRef.current
    if (!turn) return
    turnRef.current = null
    if (turn.moved) onCommit()
    else quarterTurn(turn.box, turn.size)
  }

  return (
    <div
      className={`page-text-frame${isAdding ? ' is-adding' : ''}`}
      style={{ width: layout.width, height: layout.height, transform: layout.transform }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        if (event.target !== event.currentTarget) return
        if (isAdding) {
          const { offsetX, offsetY } = event.nativeEvent
          onAdd(clamp01(offsetX / layout.width), clamp01(offsetY / layout.height))
        } else {
          onSelect(null)
        }
      }}
    >
      {boxes.map((box) => {
        const lines = box.text.split('\n')
        const isSelected = box.id === selectedId
        return (
          <div
            key={box.id}
            className={`page-text-box is-editable${isSelected ? ' is-selected' : ''}`}
            data-text-box-id={box.id}
            style={boxStyle(box, pxPerPt, layout.width, layout.height)}
          >
            <textarea
              value={box.text}
              rows={lines.length}
              spellCheck={false}
              autoFocus={box.id === focusId}
              aria-label="Text on page"
              placeholder="Type…"
              style={{ lineHeight: TEXT_LINE_HEIGHT, fontFamily: TEXT_FONT }}
              onFocus={() => onSelect(box.id)}
              onChange={(event) => onTextChange(box.id, event.target.value)}
              onBlur={onCommit}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') event.currentTarget.blur()
              }}
            />
            {isSelected && (
              <>
                <button
                  type="button"
                  className="page-text-grip is-move"
                  aria-label="Drag to move text"
                  title="Drag to move"
                  onPointerDown={(event) => startDrag(event, box)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <Move size={12} />
                </button>
                <button
                  type="button"
                  className="page-text-grip is-rotate"
                  aria-label="Drag to rotate text"
                  title="Click to turn 90°, or drag to rotate (Shift snaps to 15°)"
                  onPointerDown={(event) => startTurn(event, box)}
                  onPointerMove={moveTurn}
                  onPointerUp={endTurn}
                  onPointerCancel={endTurn}
                  onClick={(event) => {
                    // Pointer clicks are handled on release; this covers the keyboard (Enter or Space).
                    if (event.detail !== 0) return
                    const element = event.currentTarget.closest<HTMLElement>('.page-text-box')
                    if (!element) return
                    quarterTurn(box, { width: element.offsetWidth, height: element.offsetHeight })
                  }}
                >
                  <RotateCw size={12} />
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
