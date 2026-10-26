import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

// Rows rendered above and below the viewport, so quick scrolling rarely shows blank space.
const OVERSCAN_ROWS = 3
// Small documents render every card, so none of the grid's behaviour changes for them.
export const WINDOW_THRESHOLD = 150

interface GridMetrics {
  columns: number
  rowHeight: number
  gapX: number
  gapY: number
  cardWidth: number
  basePadding: number
}

const INITIAL_METRICS: GridMetrics = {
  columns: 4,
  rowHeight: 300,
  gapX: 18,
  gapY: 18,
  cardWidth: 200,
  basePadding: 26,
}

const px = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Renders only the grid rows near the viewport. The grid keeps its own CSS layout; padding stands in for the rows left out.
export function useGridWindow(
  gridRef: RefObject<HTMLElement | null>,
  itemCount: number,
  hasGrid: boolean,
  layoutKey: number,
) {
  const enabled = itemCount > WINDOW_THRESHOLD
  const [metrics, setMetrics] = useState(INITIAL_METRICS)
  const [rows, setRows] = useState({ start: 0, end: 12 })
  const metricsRef = useRef(metrics)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    metricsRef.current = metrics
  }, [metrics])

  const totalRows = Math.ceil(itemCount / metrics.columns)

  // Works out which rows the viewport shows, from the grid's position in the page.
  const updateRows = useCallback(() => {
    const grid = gridRef.current
    if (!grid || !enabled) return
    const { columns, rowHeight, gapY, basePadding } = metricsRef.current
    const stride = rowHeight + gapY
    const itemsTop = grid.getBoundingClientRect().top + window.scrollY + basePadding
    const firstVisible = Math.floor((window.scrollY - itemsTop) / stride)
    const lastVisible = Math.floor((window.scrollY + window.innerHeight - itemsTop) / stride)
    const total = Math.ceil(itemCount / columns)
    const start = Math.max(0, firstVisible - OVERSCAN_ROWS)
    const end = Math.min(total, Math.max(start + 1, lastVisible + OVERSCAN_ROWS + 1))
    setRows((current) => (current.start === start && current.end === end ? current : { start, end }))
  }, [enabled, gridRef, itemCount])

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== undefined) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined
      updateRows()
    })
  }, [updateRows])

  // Reads the real column count and row height from the browser's own layout.
  const measure = useCallback(() => {
    const grid = gridRef.current
    if (!grid || !enabled) return
    const style = getComputedStyle(grid)
    const gapX = px(style.columnGap, INITIAL_METRICS.gapX)
    const gapY = px(style.rowGap, INITIAL_METRICS.gapY)
    // The browser resolves the column tracks (including the mobile breakpoints), so read them rather than recompute them.
    const tracks = style.gridTemplateColumns.split(' ').filter((track) => track.endsWith('px'))
    const columns = Math.max(1, tracks.length)
    const cardWidth = px(tracks[0] ?? '', INITIAL_METRICS.cardWidth)
    const basePadding = px(style.getPropertyValue('--grid-pad-top'), INITIAL_METRICS.basePadding)
    let rowHeight = 0
    grid.querySelectorAll<HTMLElement>('[data-page-ids]').forEach((card) => {
      rowHeight = Math.max(rowHeight, card.offsetHeight)
    })
    setMetrics((current) => {
      const next = {
        columns,
        rowHeight: rowHeight > 0 ? Math.ceil(rowHeight) : current.rowHeight,
        gapX,
        gapY,
        cardWidth,
        basePadding,
      }
      const same = (Object.keys(next) as Array<keyof GridMetrics>).every(
        (key) => Math.abs(next[key] - current[key]) < 0.5,
      )
      return same ? current : next
    })
  }, [enabled, gridRef])

  // Measure before paint so the first frame already has the right rows.
  useLayoutEffect(() => {
    measure()
  })

  useLayoutEffect(() => {
    updateRows()
  }, [metrics, updateRows, layoutKey])

  useEffect(() => {
    if (!enabled || !hasGrid) return
    const grid = gridRef.current
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure())
    if (grid) observer?.observe(grid)
    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      observer?.disconnect()
      if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
  }, [enabled, gridRef, hasGrid, measure, scheduleUpdate])

  const stride = metrics.rowHeight + metrics.gapY
  const start = enabled ? Math.min(rows.start, Math.max(0, totalRows - 1)) : 0
  const end = enabled ? Math.min(rows.end, totalRows) : totalRows

  // Where an item sits in the grid, for items that are not rendered.
  const getItemRect = useCallback(
    (index: number) => {
      const row = Math.floor(index / metrics.columns)
      const column = index % metrics.columns
      return {
        left: column * (metrics.cardWidth + metrics.gapX),
        top: metrics.basePadding + row * (metrics.rowHeight + metrics.gapY),
        width: metrics.cardWidth,
        height: metrics.rowHeight,
      }
    },
    [metrics],
  )

  return {
    enabled,
    startIndex: enabled ? start * metrics.columns : 0,
    endIndex: enabled ? Math.min(itemCount, end * metrics.columns) : itemCount,
    paddingTop: enabled ? start * stride : 0,
    paddingBottom: enabled ? Math.max(0, totalRows - end) * stride : 0,
    rowHeight: metrics.rowHeight,
    getItemRect,
  }
}
