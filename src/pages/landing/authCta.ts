import { createContext, useContext } from 'react'

export type AuthIntent = 'signin' | 'register' | 'demo'

/** Location state that tells the existing Login page to run its Demo Login handler. */
export interface DemoRouteState {
  startDemo?: boolean
}

export const AuthCtaContext = createContext<((intent: AuthIntent, from: HTMLElement) => void) | null>(null)

/** Opens the one shared auth dialog, expanding it from the control that was pressed. */
export function useAuthCta() {
  const open = useContext(AuthCtaContext)
  if (!open) throw new Error('useAuthCta must be used inside the landing page')
  return open
}
