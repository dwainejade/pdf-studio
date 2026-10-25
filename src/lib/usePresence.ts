import { useEffect, useState } from 'react'

// Keeps something mounted for `exitMs` after `show` turns false, so it can play an exit animation.
// `leaving` is true during that time. Turning `show` back on cancels the exit.
export function usePresence(show: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [state, setState] = useState({ mounted: show, leaving: false })
  if (show && (!state.mounted || state.leaving)) setState({ mounted: true, leaving: false })
  if (!show && state.mounted && !state.leaving) setState({ mounted: true, leaving: true })

  useEffect(() => {
    if (show || !state.leaving) return
    const timer = window.setTimeout(() => setState({ mounted: false, leaving: false }), exitMs)
    return () => window.clearTimeout(timer)
  }, [show, state.leaving, exitMs])

  return state
}
