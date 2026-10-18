import type * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// Field primitives with a visible label, helper text and a linked error,
// per docs/DESIGN.md §6.2.

export type Option = { value: string; label: string }

// Radix Select cannot hold an empty value, so "none" stands in for it.
export const NONE = "__none__"

type FieldShellProps = {
  id: string
  label: string
  required?: boolean
  helper?: string
  error?: string
  className?: string
  children: React.ReactNode
}

export function FieldShell({
  id,
  label,
  required,
  helper,
  error,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive-text"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, error?: string, helper?: string) {
  if (error) return `${id}-error`
  if (helper) return `${id}-helper`
  return undefined
}

export function TextField({
  id,
  label,
  value,
  onChange,
  required,
  helper,
  error,
  className,
  mono,
  ...inputProps
}: Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helper?: string
  error?: string
  mono?: boolean
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      helper={helper}
      error={error}
      className={className}
    >
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, helper)}
        required={required}
        className={cn(mono && "font-mono", inputProps.type === "number" && "text-right num")}
        {...inputProps}
      />
    </FieldShell>
  )
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  helper,
  error,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helper?: string
  error?: string
  className?: string
}) {
  return (
    <FieldShell id={id} label={label} helper={helper} error={error} className={className}>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy(id, error, helper)}
      />
    </FieldShell>
  )
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required,
  helper,
  error,
  disabled,
  placeholder = "Choose…",
  allowNone,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  required?: boolean
  helper?: string
  error?: string
  disabled?: boolean
  placeholder?: string
  allowNone?: boolean
  className?: string
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      helper={helper}
      error={error}
      className={className}
    >
      <Select
        value={value || (allowNone ? NONE : undefined)}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, helper)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NONE}>None</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  helper,
  disabled,
  className,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  helper?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled}
        aria-describedby={helper ? `${id}-helper` : undefined}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className={cn(disabled && "text-muted-foreground")}>
          {label}
        </Label>
        {helper ? (
          <p id={`${id}-helper`} className="text-xs text-muted-foreground">
            {helper}
          </p>
        ) : null}
      </div>
    </div>
  )
}
