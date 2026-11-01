import { useState } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Circle, Clock, ShieldCheck } from 'lucide-react'
import { Reveal } from './Reveal'

type StepState = 'done' | 'waiting' | 'off'

const LEVELS = [
  {
    id: 'advisory', level: 'Level 1', name: 'Advisory', summary: 'AI observes and recommends.',
    example: 'EcomMind identifies a restocking opportunity and recommends the next action. Nothing is executed.',
    status: 'Recommendation ready',
    steps: [['Observes', 'done'], ['Recommends', 'done'], ['Executes', 'off']] as [string, StepState][],
  },
  {
    id: 'approval', level: 'Level 2', name: 'Approval-Based', summary: 'AI prepares actions and waits for approval.',
    example: 'EcomMind prepares a supplier counter-offer and waits for your approval before proceeding.',
    status: 'Waiting for your approval',
    steps: [['Prepares', 'done'], ['You approve', 'waiting'], ['Executes', 'off']] as [string, StepState][],
  },
  {
    id: 'restricted', level: 'Level 3', name: 'Restricted Auto', summary: 'AI acts within the limits explicitly configured by the seller.',
    example: 'EcomMind can execute permitted actions automatically within your signed budget and margin rules.',
    status: 'Acting within your limits',
    steps: [['Checks limits', 'done'], ['Executes', 'done'], ['Logs activity', 'done']] as [string, StepState][],
  },
]

const SAFEGUARDS = [
  'Daily budget', 'Per-order limit', 'Per-call limit', 'Daily wallet limit', 'Minimum gross margin',
  'Maximum unapproved price change', 'Automatic pause when returns exceed the threshold', 'Approval queue', 'Complete activity log', 'Emergency kill-switch',
]

const STEP_ICON = { done: Check, waiting: Clock, off: Circle }

export default function Autonomy() {
  const [selected, setSelected] = useState(LEVELS[0].id)
  const level = LEVELS.find((l) => l.id === selected) ?? LEVELS[0]

  return (
    <section id="control" className="lp-section" aria-labelledby="autonomy-title">
      <div className="lp-container">
        <Reveal className="lp-console px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-[#d8bcff] uppercase">Seller control</p>
              <h2 id="autonomy-title" className="mt-2.5 text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.12] font-extrabold tracking-[-0.03em]">
                Powerful AI. <span className="lp-accent-light">Completely under your control.</span>
              </h2>
              <RadioGroup.Root
                value={selected}
                onValueChange={setSelected}
                aria-label="Autonomy level"
                className="mt-7 flex flex-col gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10 sm:flex-row"
              >
                {LEVELS.map((item) => (
                  <RadioGroup.Item key={item.id} value={item.id} className="lp-level">
                    {selected === item.id && (
                      <motion.span layoutId="autonomy-level" className="lp-level-indicator" transition={{ type: 'spring', stiffness: 420, damping: 36 }} aria-hidden />
                    )}
                    <span className="relative">{item.name}</span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
              <p className="lp-console-muted mt-3 text-xs">Illustration only. Changing this here doesn&apos;t change any account setting.</p>
            </div>

            <div className="min-h-[15rem] rounded-2xl bg-white/[0.05] p-5 ring-1 ring-white/10 sm:p-6" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={level.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{level.level}: {level.summary}</p>
                  </div>
                  <p className="lp-console-muted mt-3 text-[15px] leading-relaxed">&ldquo;{level.example}&rdquo;</p>
                  <ol className="mt-5 grid grid-cols-3 gap-2">
                    {level.steps.map(([label, state]) => {
                      const Icon = STEP_ICON[state]
                      return (
                        <li key={label} className="rounded-xl bg-white/[0.06] px-2.5 py-2.5 text-xs">
                          <Icon className={state === 'done' ? 'h-4 w-4 text-[#5eead4]' : state === 'waiting' ? 'h-4 w-4 text-[#ffc48a]' : 'h-4 w-4 text-[#8f89ad]'} aria-hidden />
                          <span className="mt-1.5 block leading-snug">{label}</span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="mt-4 text-xs font-semibold text-[#d8bcff]">Status: {level.status}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-10 border-t border-white/10 pt-8">
            <h3 className="text-sm font-semibold">Safeguards you can set</h3>
            <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAFEGUARDS.map((item) => (
                <li key={item} className="lp-console-muted flex items-start gap-2.5 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5eead4]" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
