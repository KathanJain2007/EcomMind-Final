import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/store/ThemeContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cx } from '@/lib/format'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, effectiveTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cx('relative h-9 w-9 text-muted-foreground hover:text-foreground', className)}
          aria-label="Toggle theme"
          title={`Theme: ${theme} (currently ${effectiveTheme})`}
        >
          {effectiveTheme === 'dark' ? (
            <Moon className="h-4 w-4 transition-transform" aria-hidden />
          ) : (
            <Sun className="h-4 w-4 transition-transform" aria-hidden />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={cx('cursor-pointer gap-2', theme === 'light' && 'font-semibold text-brand-soft')}
        >
          <Sun className="h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-xs text-brand-soft">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={cx('cursor-pointer gap-2', theme === 'dark' && 'font-semibold text-brand-soft')}
        >
          <Moon className="h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-xs text-brand-soft">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={cx('cursor-pointer gap-2', theme === 'system' && 'font-semibold text-brand-soft')}
        >
          <Monitor className="h-4 w-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-xs text-brand-soft">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <div className={cx('inline-flex rounded-lg border border-border bg-secondary/50 p-1', className)}>
      {options.map((opt) => {
        const Icon = opt.icon
        const isSelected = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={cx(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
              isSelected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
            )}
            aria-pressed={isSelected}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
