import { useLayoutEffect, useRef, type HTMLAttributes } from 'react'

type MorphBarProps = HTMLAttributes<HTMLDivElement> & { contentClassName?: string }

/**
 * A bar whose outline glides to its content's new size instead of snapping. The content lays out
 * at its natural size inside; the outer box is given that size explicitly, so CSS can transition
 * `width` and `height` (which it cannot do between two `auto` values).
 */
export function MorphBar({ children, contentClassName, ...rest }: MorphBarProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    let first = true
    const fit = () => {
      const borderX = outer.offsetWidth - outer.clientWidth
      const borderY = outer.offsetHeight - outer.clientHeight
      // The first size is applied instantly; only later changes morph.
      if (first) outer.style.transition = 'none'
      outer.style.width = `${inner.offsetWidth + borderX}px`
      outer.style.height = `${inner.offsetHeight + borderY}px`
      if (first) {
        void outer.offsetWidth
        outer.style.transition = ''
        first = false
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={outerRef} {...rest}>
      <div ref={innerRef} className={contentClassName}>
        {children}
      </div>
    </div>
  )
}
