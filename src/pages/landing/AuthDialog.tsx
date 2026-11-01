import { useRef, type ReactNode, type RefObject } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import BrandMark from '@/components/BrandMark'

const EASE = [0.2, 0.8, 0.2, 1] as const
const SHEET_QUERY = '(max-width: 639px)'

interface AuthDialogProps {
  /** The routed Login or Register page; null while the dialog is closed. */
  children: ReactNode
  onClose: () => void
  /** The control that opened the dialog. */
  invoker: RefObject<HTMLElement | null>
  /** Where focus lands when nothing else opened it, such as a deep link to /login. */
  fallback: RefObject<HTMLElement | null>
}

/** Offset from screen centre to the control, so the card appears to grow out of it. */
function expandFrom(el: HTMLElement | null) {
  if (window.matchMedia(SHEET_QUERY).matches) return { opacity: 1, y: '100%' }
  if (!el) return { opacity: 0, scale: 0.96 }
  const rect = el.getBoundingClientRect()
  return {
    opacity: 0,
    scale: 0.16,
    x: rect.left + rect.width / 2 - window.innerWidth / 2,
    y: rect.top + rect.height / 2 - window.innerHeight / 2,
  }
}

export default function AuthDialog({ children, onClose, invoker, fallback }: AuthDialogProps) {
  const open = !!children
  const cardRef = useRef<HTMLDivElement>(null)
  const origin = open ? expandFrom(invoker.current?.isConnected ? invoker.current : fallback.current) : undefined

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal key="auth-dialog" forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="lp-auth-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              forceMount
              asChild
              onOpenAutoFocus={(e) => {
                // Skip the keyboard popping up on phones; on desktop go straight to the first field.
                e.preventDefault()
                const field = window.matchMedia(SHEET_QUERY).matches ? null : cardRef.current?.querySelector<HTMLElement>('input')
                ;(field ?? cardRef.current)?.focus()
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                const target = invoker.current?.isConnected ? invoker.current : fallback.current
                target?.focus()
              }}
              onEscapeKeyDown={(e) => {
                // Escape in the city field closes its suggestions first, not the whole form.
                const target = e.target as HTMLElement | null
                if (target?.getAttribute?.('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') e.preventDefault()
              }}
              onInteractOutside={(e) => {
                // A toast sits outside the dialog; touching one shouldn't dismiss the form.
                if ((e.target as HTMLElement | null)?.closest?.('[data-sonner-toaster]')) e.preventDefault()
              }}
            >
              <motion.div
                ref={cardRef}
                tabIndex={-1}
                className="lp-auth-card"
                initial={origin}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={origin}
                transition={{ duration: 0.42, ease: EASE }}
              >
                <DialogPrimitive.Title className="sr-only">Sign in or create your EcomMind account</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Sign in, create an account, or explore the sample business with Demo Login.
                </DialogPrimitive.Description>
                <span className="lp-auth-grabber" aria-hidden />
                <div className="mb-6 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <BrandMark className="h-9 w-9" />
                    <span className="font-heading text-lg font-bold tracking-tight">EcomMind</span>
                  </div>
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </DialogPrimitive.Close>
                </div>
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
