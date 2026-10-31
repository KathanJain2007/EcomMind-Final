import { Link } from 'react-router'
import { ArrowRight, FileText } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { PageHeader, EmptyState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { ReportsManager } from '@/components/ReportsManager'

export default function Reports() {
  const { demoLoaded, loadDemoBusiness } = useApp()

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Business Reports" subtitle="Advanced reports generated from live business database records." />
        <EmptyState
          title="Nothing to report yet"
          body="Load the demo business to generate sales, inventory, agent activity, financial, supplier and pricing reports."
          action={
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              Load Demo Business
            </Button>
          }
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Informational banner about navigation integration */}
      <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/10 p-3.5 text-xs text-brand-soft">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <strong>Note:</strong> Reports is now integrated inside <strong>Agent Activity</strong> for unified autonomous monitoring.
          </span>
        </div>
        <Link
          to="/activity?tab=reports"
          className="flex items-center gap-1 font-semibold text-brand-soft hover:underline"
        >
          Go to Agent Activity <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <PageHeader
        title="Reports Management"
        subtitle="Export Sales, Inventory, Activity, Financial, Supplier, and Pricing reports in CSV, Excel XLSX, and PDF formats."
      />

      {/* Render the full advanced ReportsManager */}
      <ReportsManager />
    </div>
  )
}
