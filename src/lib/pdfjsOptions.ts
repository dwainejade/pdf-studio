// Fonts, CMaps, ICC profiles and WASM decoders are copied to public/pdfjs.
// Without them pdf.js drops non-embedded fonts, CJK text, and color-managed or JPEG2000 images.
const base = `${import.meta.env.BASE_URL}pdfjs/`

export const PDFJS_ASSET_OPTIONS = {
  cMapUrl: `${base}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${base}standard_fonts/`,
  iccUrl: `${base}iccs/`,
  wasmUrl: `${base}wasm/`,
}
