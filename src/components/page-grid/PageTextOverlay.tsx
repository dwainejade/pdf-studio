import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Move } from 'lucide-react'
import type { PageTextBox, PdfPage } from '../../types/pdf'
import { frameLayout, frameSizePt, screenToFrame, TEXT_LINE_HEIGHT } from '../../lib/pageText'

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
  onMove: (id: string, x: number, y: number) => void
  /** Called when an edit is finished (blur or drag end) so it can be saved as one undo step. */
  onCommit: () => void
}

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
  onMove,
  onCommit,
}: PageTextEditorProps) {
  const layout = frameLayout(displayRotation, width, height)
  const pxPerPt = layout.width / frameSizePt(page).width
  const dragRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null)

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
    onMove(drag.id, clamp01(drag.x + delta.x / layout.width), clamp01(drag.y + delta.y / layout.height))
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onCommit()
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
              <button
                type="button"
                className="page-text-grip"
                aria-label="Drag to move text"
                title="Drag to move"
                onPointerDown={(event) => startDrag(event, box)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <Move size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
