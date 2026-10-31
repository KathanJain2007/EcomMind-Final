import markUrl from '@/assets/brand/ecommind-mark.svg'
import { cn } from '@/lib/utils'

/** The EcomMind logo symbol on a white tile, so its navy holds up in both themes. */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5', className)}>
      <img src={markUrl} alt="" className="h-full w-full" />
    </div>
  )
}
