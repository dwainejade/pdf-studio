import { useEffect } from 'react'
import type { HyaliteOptions } from '../../vendor/hyalite/hyalite'
import '../../vendor/hyalite/hyalite.js'

/**
 * Glass surfaces and how each kind is tuned. Hyalite bends the backdrop through an SVG lens map
 * (Chromium only) and writes the result to `--hyalite` / `--hyalite-edge`, which liquid-glass.css
 * consumes. Other browsers keep the CSS frost.
 */
const GLASS_GROUPS: [selector: string, options: HyaliteOptions][] = [
  ['.page-action-toolbar', { blur: 3 }],
  // The menu is read from, so it gets more frost and lenses in as it opens.
  ['.page-context-menu', { blur: 6, materialize: 180 }],
]

export function LiquidGlass() {
  useEffect(() => {
    const { Hyalite } = window
    if (!Hyalite?.supported()) return
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return
    const root = document.documentElement
    root.classList.add('has-hyalite-glass')
    const watchers = GLASS_GROUPS.map(([selector, options]) => Hyalite.watch(document.body, selector, options))
    return () => {
      watchers.forEach((watcher) => watcher.stop())
      root.classList.remove('has-hyalite-glass')
    }
  }, [])

  return null
}
