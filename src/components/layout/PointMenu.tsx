import { Menu as BaseMenu } from '@base-ui/react/menu'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { GlassTheme } from '../liquikit/glass'
import { MorphPane, PopupState } from '../liquikit/popup'
import '../liquikit/liquikit.css'

/**
 * A liquikit glass menu opened at a point, for menus the app opens itself (such as the page
 * context menu, which the grid raises with its own page IDs and position).
 *
 * It is liquikit's ContextMenu without the trigger: Base UI's Menu, anchored to the point, with
 * liquikit's MorphPane growing the glass out of a droplet at that point. Base UI handles focus,
 * keyboard navigation, Escape and outside clicks, and plays the exit before unmounting.
 * Use liquikit's `Menu.Item` for the items.
 */
export function PointMenu({
  open,
  point,
  onClose,
  theme,
  label,
  children,
}: {
  open: boolean
  point: { x: number; y: number } | null
  onClose: () => void
  theme: GlassTheme
  label: string
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLElement | null>(null)
  // Kept after closing, so the menu shrinks back to where it opened.
  const [at, setAt] = useState(point)
  if (point && (point.x !== at?.x || point.y !== at?.y)) setAt(point)
  const pointRef = useMemo(() => ({ current: at }), [at])
  const state = useMemo(() => ({ open, trigger: triggerRef, point: pointRef }), [open, pointRef])
  // A zero-size box at the point, for Base UI to position the menu against.
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () => DOMRect.fromRect({ x: at?.x ?? 0, y: at?.y ?? 0, width: 0, height: 0 }),
    }),
    [at],
  )

  return (
    <PopupState.Provider value={state}>
      <BaseMenu.Root open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
        <BaseMenu.Portal>
          <BaseMenu.Positioner
            className="glass-ui-positioner"
            anchor={anchor}
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
          >
            <BaseMenu.Popup
              aria-label={label}
              finalFocus={false}
              className="glass-ui-popup glass-ui-menu page-glass-menu"
              render={(props) => <MorphPane {...props} origin="point" theme={theme} />}
            >
              <div className="glass-ui-menu__list">{children}</div>
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      </BaseMenu.Root>
    </PopupState.Provider>
  )
}
