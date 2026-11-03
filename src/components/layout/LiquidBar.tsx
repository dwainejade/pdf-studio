import { animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { GlassPane, type GlassTheme } from '../liquikit/glass'
import { GLASS_LENS } from './glassLook'

/**
 * The one bottom action bar. Every screen's actions live in it as a layer; the glass morphs from
 * one layer's shape to the next like liquid, and the layers cross-fade, so going from the page
 * grid to the maximized page (and back) reshapes the same bar instead of swapping bars.
 *
 * The glass is a liquikit GlassPane driven through its `shape`: a centre, size and radius that
 * spring to the active layer's size (and bend the page while they move). Content is clipped to
 * that shape, so a growing bar reveals its buttons and a shrinking one swallows them.
 */

export type LiquidBarLayer = {
  key: string
  /** The layer's content, or nothing for a layer another component fills through `slotRef`. */
  content?: ReactNode
  /** Receives the layer's element, for a screen that portals its own controls in. */
  slotRef?: (element: HTMLElement | null) => void
  /** Glass theme while this layer is showing. */
  theme: GlassTheme
  className?: string
}

type Size = { width: number; height: number }

// liquikit's popup "swell": a soft spring with a little overshoot.
const SWELL = { type: 'spring', visualDuration: 0.42, bounce: 0.28 } as const
const SWELL_LAG = 0.03
const DROPLET = 24
// Room for the spring's overshoot past the largest layer.
const REACH = { top: 14, right: 28, bottom: 14, left: 28 }

export function LiquidBar({
  layers,
  active,
  leaving = false,
  className,
  label,
}: {
  layers: LiquidBarLayer[]
  active: string
  leaving?: boolean
  className?: string
  label: string
}) {
  const reduceMotion = useReducedMotion() ?? false
  // Layer elements by key; one map for the bar's lifetime.
  const [elements] = useState(() => new Map<string, HTMLElement>())
  const [sizes, setSizes] = useState<Record<string, Size>>({})

  const width = useMotionValue(DROPLET)
  const height = useMotionValue(DROPLET)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const radius = useTransform([width, height], ([w, h]: number[]) => Math.min(w, h) / 2)
  const shape = useMemo(() => ({ x, y, width, height, radius }), [height, radius, width, x, y])

  // Measure every layer at its natural size.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setSizes((current) => {
        const next: Record<string, Size> = {}
        let changed = false
        for (const [key, element] of elements) {
          const size = { width: element.offsetWidth, height: element.offsetHeight }
          next[key] = size
          if (current[key]?.width !== size.width || current[key]?.height !== size.height) changed = true
        }
        if (Object.keys(current).length !== Object.keys(next).length) changed = true
        return changed ? next : current
      })
    })
    for (const element of elements.values()) observer.observe(element)
    return () => observer.disconnect()
  }, [elements, layers.length])

  const empty = (size?: Size) => !size || size.width === 0 || size.height === 0
  const box = {
    width: Math.max(DROPLET, ...Object.values(sizes).map((size) => size.width)),
    height: Math.max(DROPLET, ...Object.values(sizes).map((size) => size.height)),
  }
  const target = sizes[active]
  const goal = leaving || empty(target) ? { width: DROPLET, height: DROPLET } : target

  useLayoutEffect(() => {
    x.set(box.width / 2)
    y.set(box.height / 2)
    if (reduceMotion) {
      width.set(goal.width)
      height.set(goal.height)
      return
    }
    // Grow along the long side first, as liquikit's popups do, so the bar stretches like a drop.
    const controls = [
      animate(width, goal.width, SWELL),
      animate(height, goal.height, { ...SWELL, delay: SWELL_LAG }),
    ]
    return () => controls.forEach((control) => control.stop())
  }, [box.height, box.width, goal.height, goal.width, height, reduceMotion, width, x, y])

  const theme = layers.find((layer) => layer.key === active)?.theme ?? 'light'

  return (
    <div className={['liquid-bar', className].filter(Boolean).join(' ')} role="region" aria-label={label}>
      <GlassPane
        radius="capsule"
        theme={theme}
        lens={GLASS_LENS[theme]}
        shape={shape}
        reach={REACH}
        style={{ width: box.width, height: box.height }}
      >
        <div className="liquid-bar-stack" style={{ width: box.width, height: box.height }}>
          {layers.map((layer) => (
            <Layer key={layer.key} layer={layer} active={layer.key === active && !leaving} elements={elements} />
          ))}
        </div>
      </GlassPane>
    </div>
  )
}

function Layer({
  layer,
  active,
  elements,
}: {
  layer: LiquidBarLayer
  active: boolean
  elements: Map<string, HTMLElement>
}) {
  const { key, slotRef } = layer
  // Stable, so a screen portalling into this layer is not handed a new element every render.
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) elements.set(key, element)
      else elements.delete(key)
      slotRef?.(element)
    },
    [elements, key, slotRef],
  )
  return (
    <div
      ref={ref}
      className={['liquid-bar-layer', layer.className].filter(Boolean).join(' ')}
      data-active={active ? '' : undefined}
      inert={!active}
    >
      {layer.content}
    </div>
  )
}
