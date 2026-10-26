import type { Option } from "@/components/app/form"

/** How inventory is counted (spec 0005 `standardUom`). */
export const STANDARD_UOM_OPTIONS: Option[] = [
  { value: "each", label: "Each" },
  { value: "pair", label: "Pair" },
  { value: "set", label: "Set" },
  { value: "dozen", label: "Dozen" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "t", label: "Metric ton (t)" },
  { value: "lb", label: "Pound (lb)" },
  { value: "m", label: "Meter (m)" },
  { value: "cm", label: "Centimeter (cm)" },
  { value: "mm", label: "Millimeter (mm)" },
  { value: "ft", label: "Foot (ft)" },
  { value: "in", label: "Inch (in)" },
  { value: "L", label: "Liter (L)" },
  { value: "ml", label: "Milliliter (ml)" },
  { value: "roll", label: "Roll" },
  { value: "tube", label: "Tube" },
  { value: "sheet", label: "Sheet" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
]

/** Larger or alternate units for purchase / sales conversion (not the stock count unit). */
export const PACKAGING_UOM_OPTIONS: Option[] = [
  { value: "box", label: "Box" },
  { value: "case", label: "Case" },
  { value: "carton", label: "Carton" },
  { value: "pack", label: "Pack" },
  { value: "bundle", label: "Bundle" },
  { value: "bag", label: "Bag" },
  { value: "pallet", label: "Pallet" },
  { value: "roll", label: "Roll" },
  { value: "drum", label: "Drum" },
  { value: "bottle", label: "Bottle" },
  { value: "can", label: "Can" },
  { value: "sack", label: "Sack" },
  { value: "crate", label: "Crate" },
  { value: "tray", label: "Tray" },
  { value: "dozen", label: "Dozen" },
]

/** Keeps legacy or custom units editable when opening an existing product. */
export function withCurrentUom(options: Option[], current: string): Option[] {
  const value = current.trim()
  if (!value || options.some((item) => item.value === value)) return options
  return [{ value, label: value }, ...options]
}
