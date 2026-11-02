import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react'

/**
 * A solid surface that moves like liquid.
 *
 * Behind the content sits a layer of plain coloured blobs, one per `[data-goo-blob]` element in
 * the content (or one for the whole content when there are none). That layer runs through a
 * "gooey" SVG filter — blur, then a hard alpha threshold — so blobs that come near each other
 * melt together with a liquid neck, and pull apart the same way. Blob geometry is measured from
 * the content and animated with a spring, so the surface:
 *   - emerges from droplets on mount: from `origin` when given; otherwise the first blob grows
 *     from its own centre and each later blob buds out of the right edge of the one before,
 *   - springs to its new size when the content changes,
 *   - flows back into those droplets when `leaving` turns on.
 * Once the motion settles nothing animates, so a resting surface costs nothing.
 */

type Rect = { x: number; y: number; w: number; h: number; r: number }

type GooSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string
  /** Where every blob starts and ends, relative to the surface. Defaults to budding (see above). */
  origin?: { x: number; y: number }
  /** Keep a small droplet at `origin` that the surface stretches away from (the menu's "tail"). */
  seed?: boolean
  leaving?: boolean
}

// Room around the blobs so the blur is not clipped at the layer's edge.
const GOO_PAD = 32
const DROPLET = 28

export function GooFilter() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="goo" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
      </filter>
    </svg>
  )
}

function measure(surface: HTMLElement, content: HTMLElement): Rect[] {
  const base = surface.getBoundingClientRect()
  const targets = content.querySelectorAll<HTMLElement>('[data-goo-blob]')
  const elements = targets.length ? Array.from(targets) : [content]
  return elements.map((el) => {
    const rect = el.getBoundingClientRect()
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    return { x: rect.left - base.left, y: rect.top - base.top, w: rect.width, h: rect.height, r: radius }
  })
}

function droplet(origin: { x: number; y: number }, size = DROPLET): Rect {
  return { x: origin.x - size / 2, y: origin.y - size / 2, w: size, h: size, r: size / 2 }
}

/** Where each blob gathers when collapsed: the first at its own centre, the rest inside the
 *  right end of the blob before, so they bud out of (and flow back into) their neighbour. */
function gatherPoints(blobs: Rect[]) {
  return blobs.map((blob, index) => {
    if (index === 0) return { x: blob.x + blob.w / 2, y: blob.y + blob.h / 2 }
    const previous = blobs[index - 1]
    return { x: previous.x + previous.w - previous.h / 2, y: previous.y + previous.h / 2 }
  })
}

export function GooSurface({
  children,
  className,
  contentClassName,
  origin,
  seed = false,
  leaving = false,
  ...rest
}: GooSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [blobs, setBlobs] = useState<Rect[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  // 'seeded': drawn as a droplet with no transition; 'open': springs to the measured shape.
  const [phase, setPhase] = useState<'seeded' | 'open'>('seeded')

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const content = contentRef.current
    if (!surface || !content) return
    const update = () => {
      setBlobs(measure(surface, content))
      setSize({ w: surface.offsetWidth, h: surface.offsetHeight })
    }
    update()
    const resizeObserver = new ResizeObserver(update)
    const observeAll = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(content)
      content.querySelectorAll('[data-goo-blob]').forEach((el) => resizeObserver.observe(el))
    }
    observeAll()
    const mutationObserver = new MutationObserver(() => {
      observeAll()
      update()
    })
    mutationObserver.observe(content, { childList: true, subtree: true })
    // Two frames so the droplet is painted before the spring starts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  const collapsed = phase === 'seeded' || leaving
  const points = origin ? blobs.map(() => origin) : gatherPoints(blobs)
  const shapes = blobs.map((blob, index) => (collapsed ? droplet(points[index]) : blob))
  if (seed && origin) shapes.push(droplet(origin, collapsed ? DROPLET : 0))
  // The last droplet pops toward where everything gathered.
  const popPoint = points[0] ?? { x: size.w / 2, y: size.h / 2 }

  const classes = ['goo-surface', className, phase === 'seeded' && 'is-seeded', leaving && 'is-leaving']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={surfaceRef} className={classes} {...rest}>
      <div
        className="goo-layer"
        aria-hidden="true"
        style={{ inset: -GOO_PAD, transformOrigin: `${popPoint.x + GOO_PAD}px ${popPoint.y + GOO_PAD}px` }}
      >
        {shapes.map((shape, index) => (
          <div
            key={index}
            className="goo-blob"
            style={
              {
                left: shape.x + GOO_PAD,
                top: shape.y + GOO_PAD,
                width: shape.w,
                height: shape.h,
                borderRadius: shape.r,
                '--goo-i': index,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div ref={contentRef} className={['goo-content', contentClassName].filter(Boolean).join(' ')}>
        {children}
      </div>
    </div>
  )
}
