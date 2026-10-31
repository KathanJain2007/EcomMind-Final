import {
  CheckCircle2, OctagonAlert, ShieldCheck, Sliders, XCircle,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useApiQuery } from '@/store/DataStore'
import type { ApiMandate } from '@/lib/api'
import { cx, formatDateTime, formatINR, formatPaise } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AutonomyLevel } from '@/data/models'

/* Approval queue and autonomy/mandate controls (browser-side commerce
   features), shown as tabs inside Agent Activity. */

export function ApprovalsPanel() {
  const { approvalQueue, approveQueuedAction, rejectQueuedAction, autonomyLevel } = useApp()
  return (
    <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Autonomous Operations Approval Queue</h3>
              <p className="text-xs text-muted-foreground">
                High-value purchases, margin exceptions, and promotional discounts requiring human sign-off.
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              Policy: Level {autonomyLevel} Autonomy Enforced
            </span>
          </div>

          <div className="space-y-3">
            {approvalQueue.map((item) => {
              const isPending = item.status === 'pending'
              return (
                <Card
                  key={item.id}
                  className={cx(
                    'card-surface transition-all',
                    isPending && 'border-warning/40 bg-warning/5'
                  )}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isPending ? 'default' : 'outline'}
                            className={cx(
                              'text-[10px] uppercase font-mono',
                              isPending ? 'bg-warning text-black' : item.status === 'approved' ? 'text-success' : 'text-danger'
                            )}
                          >
                            {item.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{item.agentName}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                        </div>
                        <h4 className="text-base font-semibold text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground max-w-2xl">{item.description}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">Financial Impact</p>
                        <p className={cx('tabular text-base font-bold', item.financialImpact >= 0 ? 'text-success' : 'text-foreground')}>
                          {formatINR(item.financialImpact)}
                        </p>
                      </div>
                    </div>

                    {/* Technical details pill */}
                    {item.details && (
                      <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-card/60 p-2.5 text-[11px]">
                        {Object.entries(item.details).map(([k, v]) => {
                          if (typeof v === 'object') return null
                          return (
                            <span key={k} className="rounded-md bg-secondary/70 px-2 py-0.5 text-muted-foreground">
                              <strong>{k}:</strong> {String(v)}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Action buttons */}
                    {isPending && (
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectQueuedAction(item.id, 'Declined by seller from Approval Queue')}
                          className="h-8 gap-1.5 border-danger/30 text-xs text-danger hover:bg-danger/10"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject Action
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveQueuedAction(item.id)}
                          className="h-8 btn-glow gap-1.5 border-0 text-xs text-white"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Authorize & Execute
                        </Button>
                      </div>
                    )}

                    {!isPending && (
                      <p className="mt-3 text-[11px] text-muted-foreground italic">
                        {item.status === 'approved' ? '✓ Authorized by seller' : '✕ Declined by seller'}{' '}
                        {item.reviewedAt ? `on ${formatDateTime(item.reviewedAt)}` : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {approvalQueue.length === 0 && (
              <div className="card-surface p-12 text-center text-xs text-muted-foreground">
                Approval queue is empty. High-risk operations will automatically appear here.
              </div>
            )}
          </div>
    </div>
  )
}

export function MandatesPanel() {
  const { autonomyLevel, setAutonomyLevel, signedMandate, emergencyKillSwitch } = useApp()
  const mandateQ = useApiQuery<{ mandate: ApiMandate }>('/api/mandate', ['mandate'])
  const mandate = mandateQ.data?.mandate
  return (
    <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Autonomy Level Control */}
            <div className="space-y-4 lg:col-span-2">
              <Card className="card-surface">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-brand-soft" />
                      <h4 className="text-sm font-semibold text-foreground">Autonomy Execution Modes</h4>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      Active: Level {autonomyLevel}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      {
                        level: 1 as AutonomyLevel,
                        title: 'Level 1 – Advisory',
                        desc: 'AI observes, runs forecasts, and recommends actions. Requires explicit seller initiation for all changes.',
                      },
                      {
                        level: 2 as AutonomyLevel,
                        title: 'Level 2 – Approval-Based',
                        desc: 'AI negotiates and drafts restocks and price adjustments, routing them to the Approval Queue before execution.',
                      },
                      {
                        level: 3 as AutonomyLevel,
                        title: 'Level 3 – Restricted Auto',
                        desc: 'AI autonomously executes purchases, repricing and discounts strictly within signed mandate bounds.',
                      },
                    ].map((m) => {
                      const isSel = autonomyLevel === m.level
                      return (
                        <button
                          key={m.level}
                          type="button"
                          onClick={() => setAutonomyLevel(m.level)}
                          className={cx(
                            'flex flex-col rounded-xl border p-4 text-left transition-all',
                            isSel
                              ? 'border-brand bg-brand/10 shadow-sm ring-1 ring-brand/50'
                              : 'border-border bg-card/60 hover:border-brand/40 hover:bg-secondary/30'
                          )}
                        >
                          <span className={cx('text-xs font-bold', isSel ? 'text-brand-soft' : 'text-foreground')}>
                            {m.title}
                          </span>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{m.desc}</p>
                          {isSel && (
                            <span className="mt-auto pt-2 text-[10px] font-semibold text-brand-soft">
                              ✓ Currently Active
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Cryptographic Signed Mandate Details */}
              <Card className="card-surface">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-success" />
                      <h4 className="text-sm font-semibold text-foreground">Signed Mandate Token (simulated)</h4>
                    </div>
                    <Badge variant={signedMandate.revoked ? 'destructive' : 'default'} className="text-[10px]">
                      {signedMandate.revoked ? 'REVOKED' : 'ACTIVE · DEMO SIGNATURE'}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Mandate ID</dt>
                      <dd className="font-mono font-medium text-foreground mt-0.5">{signedMandate.mandateId}</dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Agent Principal</dt>
                      <dd className="font-mono font-medium text-foreground mt-0.5">{signedMandate.agentId}</dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Authorized Max Transaction</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {formatINR(signedMandate.spendingLimits.maxPerTransaction)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Daily Budget Ceiling</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {formatINR(signedMandate.spendingLimits.maxDailyBudget)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Public Key & Signature Proof</dt>
                      <dd className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                        PK: {signedMandate.publicKey}
                      </dd>
                      <dd className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                        SIG: {signedMandate.signature}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>

            {/* Emergency Kill-Switch & Safeguards summary */}
            <div className="space-y-4">
              <Card className="card-surface border-danger/30">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-danger">
                    <OctagonAlert className="h-4 w-4" /> Fail-Closed Protection
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Triggering the emergency kill-switch pauses every agent on the server (all agent calls are refused until you resume) and revokes the demo mandate token.
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full text-xs font-semibold"
                    onClick={emergencyKillSwitch}
                  >
                    Trigger Emergency AI Pause
                  </Button>
                </CardContent>
              </Card>

              <Card className="card-surface">
                <CardContent className="space-y-3 p-5">
                  <h4 className="text-sm font-semibold text-foreground">Backend Enforced Limits</h4>
                  {!mandate ? <p className="text-xs text-muted-foreground">Loading your mandate…</p> : (
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex items-center justify-between"><span>Min gross margin</span><strong className="text-foreground">{mandate.minGrossMarginPct.toFixed(1)}%</strong></li>
                      <li className="flex items-center justify-between"><span>Max price band movement</span><strong className="text-foreground">±{mandate.maxPriceChangePct.toFixed(1)}%</strong></li>
                      <li className="flex items-center justify-between"><span>Max order value</span><strong className="text-foreground">{formatPaise(mandate.maxOrderValue)}</strong></li>
                      <li className="flex items-center justify-between"><span>Max micro-payment per call</span><strong className="text-foreground">{formatPaise(mandate.maxPerCallCost, { decimals: 2 })}</strong></li>
                      <li className="flex items-center justify-between"><span>Daily budget</span><strong className="text-foreground">{formatPaise(mandate.dailyBudget)}</strong></li>
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground">Edit these in Settings. The backend checks them on every agent call and deal.</p>
                </CardContent>
              </Card>
            </div>
          </div>
    </div>
  )
}
