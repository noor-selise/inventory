import { THEME_OPTIONS } from "@/components/app/theme-menu"
import { PageHeader, SectionCard } from "@/components/app/page"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

// Dark, light or system theme, saved in this browser (docs/DESIGN.md §5.3).
export function AppearancePage() {
  const { theme, setTheme } = useTheme()

  return (
    <>
      <PageHeader title="Appearance" description="Choose how the app looks on this device." />
      <SectionCard title="Theme" className="max-w-3xl">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-secondary text-sm font-semibold transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
                )}
              >
                <option.icon className="size-5" />
                {option.label}
              </button>
            )
          })}
        </div>
      </SectionCard>
    </>
  )
}
