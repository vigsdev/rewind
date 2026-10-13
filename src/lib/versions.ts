export interface PrprojVersionOption {
  version: number
  label: string
}

// Premiere Pro project schema version -> release year, newest first.
export const PRPROJ_VERSIONS: PrprojVersionOption[] = [
  { version: 46, label: "CC 2026" },
  { version: 45, label: "CC 2025" },
  { version: 44, label: "CC 2024" },
  { version: 43, label: "CC 2023" },
]

export function getVersionLabel(version: number): string | undefined {
  return PRPROJ_VERSIONS.find((option) => option.version === version)?.label
}
