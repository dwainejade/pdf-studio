import type { GlassTheme, LensProfile } from '../liquikit/glass'

/**
 * Lens overrides for the app's glass, on top of liquikit's pane and dark-theme defaults. Every
 * setting and its default is in liquikit/glass/presets.ts; the ones that shape the look:
 *   thickness, bevel, ior, magnification   how strongly the rim bends the page while in use
 *   environment, rimLight, rimShadow       light and shade along the curved rim
 *   specularStrength, lightAngle           the glints from the key light
 * These only reach the thin curved rim, so they are subtle. The broad light across the top of
 * the glass is the app's own sheen in liquikit-app.css (--glass-top-light).
 * Module-level objects, so a lens is only rebuilt when the theme changes.
 */
export const GLASS_LENS: Record<GlassTheme, Partial<LensProfile> | undefined> = {
  light: undefined,
  dark: undefined,
}
