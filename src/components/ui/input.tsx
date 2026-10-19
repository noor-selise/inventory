import * as React from "react"
import { cn } from "cn"

const numberInputClass =
  "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"

// Number inputs refuse negatives unless allowNegative is set: the min attribute
// alone only flags the value, it still lets a user type or paste "-1".
function Input({ className, type, allowNegative, min, onKeyDown, onChange, ...props }: React.ComponentProps<"input"> & { allowNegative?: boolean }) {
  const blockNegative = type === "number" && !allowNegative
  return (
    <input
      type={type}
      min={blockNegative ? (min ?? 0) : min}
      onKeyDown={(event) => {
        if (blockNegative && event.key === "-") event.preventDefault()
        onKeyDown?.(event)
      }}
      onChange={(event) => {
        if (blockNegative && event.target.value.startsWith("-")) event.target.value = event.target.value.slice(1)
        onChange?.(event)
      }}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        type === "number" && numberInputClass,
        className
      )}
      {...props}
    />
  )
}

export { Input }
