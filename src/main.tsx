import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handles for poking at the app from the browser console while developing.
if (import.meta.env.DEV) {
  void Promise.all([import('pdfjs-dist'), import('./store/pdfStore'), import('./lib/export/merged')]).then(
    ([pdfjs, { usePdfStore }, { createMergedPdf }]) => {
      Object.assign(window, { __studio: { store: usePdfStore, createMergedPdf, pdfjs } })
    },
  )
}

// The worker only exists in production builds; in development it would cache stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
