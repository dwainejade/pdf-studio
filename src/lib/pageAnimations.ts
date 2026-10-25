// Grouping gathers the selected pages into a paper stack; ungrouping deals them back out. Deleted pages shrink away,
// new pages drop in, and a dragged page is lifted with a shadow and a tilt.
// They share one motion language: staggered spring flights with the same sheet tilts the
// stack uses (see .group-preview-sheet-layer-*).

const STAGGER_MS = 55
const MAX_STAGGER_STEPS = 5
const FLIGHT_MS = 640
const HANDOFF_MS = 120
// Where each page rests in the stack, matching .group-preview-sheet-layer-*: the first page is the
// flat cover, the rest sit behind it in the same order the real sheets do.
const STACK_POSES = [
  { x: 0, y: 0, rotate: 0 },
  { x: 3, y: 1, rotate: 1.5 },
  { x: -5, y: 2, rotate: -2.5 },
  { x: 8, y: 4, rotate: 4.5 },
  { x: -9, y: 5, rotate: -6 },
]

const FALLBACK_EASING = 'cubic-bezier(0.22, 0.75, 0.25, 1)'

// A lightly underdamped spring, sampled into a CSS linear() easing so it can overshoot and settle.
function createSpringEasing() {
  const supportsLinear =
    typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')
  if (!supportsLinear) return FALLBACK_EASING
  const damping = 0.65
  const omega = 4.6 / damping
  const damped = omega * Math.sqrt(1 - damping * damping)
  const samples = Array.from({ length: 48 }, (_, index) => {
    const t = index / 47
    const value =
      1 -
      Math.exp(-damping * omega * t) *
        (Math.cos(damped * t) + ((damping * omega) / damped) * Math.sin(damped * t))
    return index === 47 ? 1 : Number(value.toFixed(4))
  })
  return `linear(${samples.join(', ')})`
}

export const SPRING = createSpringEasing()

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const idsOf = (card: HTMLElement) => (card.dataset.pageIds ?? '').split(' ')

const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

// The cover never waits or moves; the pages beneath it follow one after another.
const stagger = (index: number) => Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS

const poseFor = (index: number) => STACK_POSES[Math.min(index, STACK_POSES.length - 1)]

// Flying copies need the grid's classes and sizing variables, or the grid-scoped card styles stop applying.
function createFlightLayer(grid: HTMLElement) {
  const layer = document.createElement('div')
  layer.className = grid.className.replace('is-marquee-selecting', '')
  const variables = ['--page-card-min-width', '--page-preview-height']
    .map((name) => `${name}:${grid.style.getPropertyValue(name)}`)
    .join(';')
  layer.style.cssText = `${variables};position:fixed;inset:0;z-index:40;display:block;min-height:0;padding:0;perspective:none;contain:none;pointer-events:none`
  layer.setAttribute('aria-hidden', 'true')
  document.body.append(layer)
  return layer
}

// Fixed-position copy of a card, so it can fly above the grid while the real layout changes.
function cloneCard(card: HTMLElement, layer: HTMLElement, rect: DOMRect, zIndex: number) {
  const clone = card.cloneNode(true) as HTMLElement
  clone.classList.remove('is-selected', 'is-dragging')
  clone.setAttribute('aria-hidden', 'true')
  clone.inert = true
  clone.draggable = false
  clone.tabIndex = -1
  const sourceCanvases = card.querySelectorAll('canvas')
  clone.querySelectorAll('canvas').forEach((copy, index) => {
    const canvas = sourceCanvases[index]
    if (canvas) copy.getContext('2d')?.drawImage(canvas, 0, 0)
  })
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: String(zIndex),
    pointerEvents: 'none',
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
  })
  layer.append(clone)
  return clone
}

function getGrid() {
  return document.querySelector<HTMLElement>('.page-grid')
}

// Applies the store change, then lets the new layout render before the callback measures it.
function afterRender(callback: () => void) {
  window.requestAnimationFrame(callback)
}

export function groupWithAnimation(pageIds: string[], applyGroup: () => void) {
  const grid = getGrid()
  const pageIdSet = new Set(pageIds)
  const sourceCards =
    grid && !prefersReducedMotion()
      ? Array.from(grid.querySelectorAll<HTMLElement>('[data-page-ids]')).filter((card) =>
          idsOf(card).some((id) => pageIdSet.has(id)),
        )
      : []
  const layer = grid && sourceCards.length > 0 ? createFlightLayer(grid) : undefined
  const flights = layer
    ? sourceCards.map((card, index) => {
        const rect = card.getBoundingClientRect()
        // The first page stays on top, like the cover it becomes.
        const clone = cloneCard(card, layer, rect, sourceCards.length - index + 1)
        // Only the top page keeps its controls; a pile of checkboxes would clutter the stack.
        if (index > 0) clone.querySelectorAll('button').forEach((button) => button.remove())
        return { rect, clone }
      })
    : []

  applyGroup()
  if (flights.length === 0) return

  afterRender(() => {
    const target = Array.from(
      document.querySelectorAll<HTMLElement>('.page-grid .group-card'),
    ).find((card) => {
      const ids = idsOf(card)
      return ids.length === pageIdSet.size && ids.every((id) => pageIdSet.has(id))
    })
    if (!target) {
      layer?.remove()
      return
    }

    const to = center(target.getBoundingClientRect())
    const landedAt = stagger(flights.length - 1) + FLIGHT_MS

    // The real stack is the same size and layout as the landed copies, so it simply takes over.
    const handoff = target.animate(
      [
        { opacity: 0 },
        { opacity: 0, offset: landedAt / (landedAt + HANDOFF_MS) },
        { opacity: 1 },
      ],
      { duration: landedAt + HANDOFF_MS, easing: 'linear' },
    )
    handoff.finished.then(() => layer?.remove(), () => layer?.remove())

    flights.forEach(({ rect, clone }, index) => {
      const from = center(rect)
      const pose = poseFor(index)
      clone.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)' },
          {
            transform: `translate(${to.x - from.x + pose.x}px, ${to.y - from.y + pose.y}px) rotate(${pose.rotate}deg)`,
          },
        ],
        { duration: FLIGHT_MS, delay: stagger(index), easing: SPRING, fill: 'forwards' },
      )
    })
  })
}

export function ungroupWithAnimation(pageIds: string[], applyUngroup: () => void) {
  const grid = getGrid()
  const pageIdSet = new Set(pageIds)
  const groups =
    grid && !prefersReducedMotion()
      ? Array.from(grid.querySelectorAll<HTMLElement>('.group-card'))
          .filter((card) => idsOf(card).some((id) => pageIdSet.has(id)))
          .map((card) => ({ ids: idsOf(card), rect: card.getBoundingClientRect() }))
      : []

  applyUngroup()
  if (groups.length === 0) return

  afterRender(() => {
    groups.forEach(({ ids, rect }) => {
      const from = center(rect)
      ids.forEach((id, index) => {
        const card = grid?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(id)}"]`)
        if (!card) return
        // The cover stays where it is and above the rest; the pages beneath it slide out.
        if (index === 0) {
          card.style.zIndex = '4'
          window.setTimeout(() => card.style.removeProperty('z-index'), stagger(ids.length - 1) + FLIGHT_MS)
          return
        }
        const to = center(card.getBoundingClientRect())
        const pose = poseFor(index)
        card.style.zIndex = '3'
        const deal = card.animate(
          [
            {
              transform: `translate(${from.x - to.x + pose.x}px, ${from.y - to.y + pose.y}px) rotate(${pose.rotate}deg)`,
            },
            { transform: 'translate(0, 0) rotate(0deg)' },
          ],
          { duration: FLIGHT_MS, delay: stagger(index), easing: SPRING, fill: 'backwards' },
        )
        deal.finished.then(
          () => card.style.removeProperty('z-index'),
          () => card.style.removeProperty('z-index'),
        )
      })
    })
  })
}

const EXIT_MS = 220
const ARRIVAL_MS = 420
const ARRIVAL_STAGGER_MS = 45
const MAX_ANIMATED_CARDS = 60

// A card leaves when every page on it is being removed; a group that only loses some pages stays.
const isFullyRemoved = (card: HTMLElement, ids: Set<string>) => idsOf(card).every((id) => ids.has(id))

// Deleted cards shrink and fade where they were while the store updates, and the rest of the grid slides into the gap
// (the grid's own FLIP handles that part).
export function removeWithAnimation(pageIds: string[], applyRemoval: () => void) {
  const grid = getGrid()
  const ids = new Set(pageIds)
  const cards =
    grid && !prefersReducedMotion()
      ? Array.from(grid.querySelectorAll<HTMLElement>('[data-page-ids]'))
          .filter((card) => isFullyRemoved(card, ids))
          .slice(0, MAX_ANIMATED_CARDS)
      : []
  const layer = grid && cards.length > 0 ? createFlightLayer(grid) : undefined
  const leaving = layer
    ? cards.map((card, index) => {
        const clone = cloneCard(card, layer, card.getBoundingClientRect(), index + 1)
        clone.querySelectorAll('button').forEach((button) => button.remove())
        return clone
      })
    : []

  applyRemoval()
  if (leaving.length === 0) return

  const finished = leaving.map(
    (clone, index) =>
      clone.animate(
        [
          { opacity: 1, transform: 'scale(1) translateY(0)' },
          { opacity: 0, transform: 'scale(0.82) translateY(10px)' },
        ],
        {
          duration: EXIT_MS,
          delay: Math.min(index, 5) * 25,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        },
      ).finished,
  )
  void Promise.allSettled(finished).then(() => layer?.remove())
}

// Pages that were not in the grid a moment ago (imported, duplicated, blank, or restored by undo) drop in with a spring.
export function animateArrivals(grid: HTMLElement, arrivedIds: Set<string>) {
  if (prefersReducedMotion()) return
  let step = 0
  grid.querySelectorAll<HTMLElement>('[data-page-ids]').forEach((card) => {
    if (step >= MAX_ANIMATED_CARDS || !isFullyRemoved(card, arrivedIds)) return
    const bounds = card.getBoundingClientRect()
    if (bounds.bottom < 0 || bounds.top > window.innerHeight) return
    card.animate(
      [
        { opacity: 0, transform: 'translateY(-22px) scale(0.86)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: ARRIVAL_MS, delay: Math.min(step, 6) * ARRIVAL_STAGGER_MS, easing: SPRING, fill: 'backwards' },
    )
    step += 1
  })
}

// While a page is dragged the browser shows a picture of it. This one is lifted: tilted, with a deep shadow,
// and a count when several pages travel together.
export function setLiftedDragImage(event: { dataTransfer: DataTransfer; clientX: number; clientY: number }, card: HTMLElement, count: number) {
  const grid = getGrid()
  if (!grid || prefersReducedMotion()) return
  const bounds = card.getBoundingClientRect()
  const pad = 36
  const ghost = document.createElement('div')
  ghost.className = `${grid.className.replace('is-marquee-selecting', '')} drag-ghost`
  const variables = ['--page-card-min-width', '--page-preview-height']
    .map((name) => `${name}:${grid.style.getPropertyValue(name)}`)
    .join(';')
  ghost.style.cssText = `${variables};position:fixed;left:-10000px;top:0;display:block;min-height:0;padding:${pad}px;width:${bounds.width + pad * 2}px;perspective:none;contain:none;pointer-events:none`
  ghost.setAttribute('aria-hidden', 'true')

  const clone = card.cloneNode(true) as HTMLElement
  clone.classList.remove('is-selected', 'is-dragging')
  clone.querySelectorAll('.page-metadata, button').forEach((element) => element.remove())
  const sourceCanvases = card.querySelectorAll('canvas')
  clone.querySelectorAll('canvas').forEach((copy, index) => {
    const canvas = sourceCanvases[index]
    if (canvas) copy.getContext('2d')?.drawImage(canvas, 0, 0)
  })
  Object.assign(clone.style, { width: `${bounds.width}px`, margin: '0', transform: '', transition: 'none' })
  ghost.append(clone)
  if (count > 1) {
    const badge = document.createElement('span')
    badge.className = 'drag-count-badge'
    badge.textContent = String(count)
    ghost.append(badge)
  }
  document.body.append(ghost)
  event.dataTransfer.setDragImage(ghost, pad + (event.clientX - bounds.left), pad + (event.clientY - bounds.top))
  // The browser has taken its picture by the time the event finishes.
  window.setTimeout(() => ghost.remove(), 0)
}
