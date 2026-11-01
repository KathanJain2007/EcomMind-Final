import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useLocation, useNavigate, useOutlet } from 'react-router'
import { Toaster } from 'sonner'
import AuthDialog from './AuthDialog'
import { DecorDefs } from './BackgroundDecor'
import { AuthCtaContext, type AuthIntent, type DemoRouteState } from './authCta'
import Hero from './Hero'
import HeroAmbient from './HeroAmbient'
import LandingHeader from './LandingHeader'
import './landing.css'

const Sections = lazy(() => import('./Sections'))

/**
 * The public page. Stays mounted across /welcome, /login and /register: the two auth routes
 * render the existing Login and Register pages through the outlet, inside the dialog.
 */
export default function Landing() {
  const outlet = useOutlet()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const signInButton = useRef<HTMLButtonElement>(null)
  const invoker = useRef<HTMLElement | null>(null)
  const { scrollY, scrollYProgress } = useScroll()
  // Reads as full until the lazy sections make the page scrollable, so hold it at 0 at the top.
  const progress = useTransform([scrollY, scrollYProgress], ([y, p]: number[]) => (y > 0 ? p : 0))

  const openAuth = useCallback((intent: AuthIntent, from: HTMLElement) => {
    invoker.current = from
    if (intent === 'register') navigate('/register')
    else if (intent === 'demo') navigate('/login', { state: { startDemo: true } satisfies DemoRouteState })
    else navigate('/login')
  }, [navigate])

  const closeAuth = useCallback(() => navigate('/welcome', { replace: true }), [navigate])

  // The dashboard scrolls the same window, so it mustn't open partway down.
  useEffect(() => () => window.scrollTo(0, 0), [])

  return (
    <AuthCtaContext.Provider value={openAuth}>
      <motion.div className="lp-progress" style={{ scaleX: progress }} aria-hidden />

      <HeroAmbient />
      <DecorDefs />

      <div className="lp-page">
        <LandingHeader buttonRef={signInButton} onSignIn={(from) => openAuth('signin', from)} />

        <main>
          <Hero />
          {/* Holds the scrollbar in place while the lower sections load, so the hero doesn't jump. */}
          <Suspense fallback={<div className="min-h-dvh" />}>
            <Sections />
          </Suspense>
        </main>
      </div>

      <AuthDialog onClose={closeAuth} invoker={invoker} fallback={signInButton}>{pathname === '/welcome' ? null : outlet}</AuthDialog>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' } }} />
    </AuthCtaContext.Provider>
  )
}
