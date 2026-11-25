import * as React from "react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClapperboardIcon,
  DownloadIcon,
  LayersIcon,
  Loader2Icon,
  LockIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"

import { OverscrollMessages } from "@/components/overscroll-messages"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AEP_VERSIONS,
  aeLabel,
  AepError,
  downgradeAep,
  readAep,
} from "@/lib/aep"
import {
  getProjectVersion,
  PrprojError,
  readPrproj,
  setProjectVersion,
  writePrproj,
} from "@/lib/prproj"
import { getVersionLabel, PRPROJ_VERSIONS } from "@/lib/versions"

type Status = "idle" | "reading" | "ready" | "error"

// What was read from the dropped file. `version` is the Premiere schema number or the After Effects major version.
type Project =
  | { kind: "prproj"; version: number; xml: string }
  | { kind: "aep"; version: number; bytes: Uint8Array; plugins: string[] }

interface Option {
  value: number
  label: string
  /** For After Effects: opened in that version after a downgrade. */
  tested?: boolean
}

const PREMIERE_OPTIONS: Option[] = PRPROJ_VERSIONS.map((v) => ({
  value: v.version,
  label: toPremiereLabel(v.label),
}))

const AE_OPTIONS: Option[] = AEP_VERSIONS.map((v) => ({
  value: v.major,
  label: aeLabel(v.major),
  tested: v.tested,
}))

const SITE_URL = "https://vigs.dev"
const STORY_URL = "https://labs.vigs.dev/rewind"

const sectionHeading =
  "text-[17px] leading-[22px] font-medium tracking-[-0.02em] text-foreground"

const label = "text-[13px] leading-[18px] font-normal text-muted-foreground"

const pill =
  "inline-flex rounded-full border border-border px-3 py-1.5 text-[13px] leading-4 text-foreground transition-colors hover:bg-card"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildOutputName(
  originalName: string,
  project: Project,
  target: number
) {
  if (project.kind === "aep") {
    return `${originalName.replace(/\.aep$/i, "")}_AE20${target}.aep`
  }
  return `${originalName.replace(/\.prproj$/i, "")}_v${target}.prproj`
}

function toPremiereLabel(label: string) {
  return label.replace(/^CC /, "Premiere Pro ")
}

/** Effects that need a plugin: not After Effects' own, not Cycore's (it ships with it), not presets saved in the project. */
function pluginsOf(effects: string[]) {
  return effects.filter(
    (e) =>
      !e.startsWith("ADBE ") &&
      !e.startsWith("CC ") &&
      !e.startsWith("CS ") &&
      !e.startsWith("Pseudo/")
  )
}

function kindOf(name: string): Project["kind"] | null {
  const lower = name.toLowerCase()
  if (lower.endsWith(".prproj")) return "prproj"
  if (lower.endsWith(".aep")) return "aep"
  return null
}

function SectionMarker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground tabular-nums">
      {children}
    </p>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/80">
      {children}
    </code>
  )
}

export function App() {
  const [file, setFile] = React.useState<File | null>(null)
  const [project, setProject] = React.useState<Project | null>(null)
  const [targetVersion, setTargetVersion] = React.useState("")
  const [status, setStatus] = React.useState<Status>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [downloadedFileName, setDownloadedFileName] = React.useState<
    string | null
  >(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const options = project?.kind === "aep" ? AE_OPTIONS : PREMIERE_OPTIONS

  const detectedLabel = React.useMemo(() => {
    if (!project) return undefined
    if (project.kind === "aep") return aeLabel(project.version)
    const label = getVersionLabel(project.version)
    return label ? toPremiereLabel(label) : undefined
  }, [project])

  const availableOptions = React.useMemo(() => {
    if (!project) return options
    return options.filter((option) => option.value < project.version)
  }, [project, options])

  const noOlderVersions = status === "ready" && availableOptions.length === 0
  const target = availableOptions.find(
    (option) => String(option.value) === targetVersion
  )

  const reset = React.useCallback(() => {
    setFile(null)
    setProject(null)
    setStatus("idle")
    setError(null)
    setIsDownloading(false)
    setDownloadedFileName(null)
  }, [])

  const handleFile = React.useCallback(async (nextFile: File) => {
    const kind = kindOf(nextFile.name)
    setFile(nextFile)
    setProject(null)
    setDownloadedFileName(null)

    if (!kind) {
      setStatus("error")
      setError(
        "That's not a .prproj or an .aep. Rewind only speaks Premiere and After Effects."
      )
      return
    }

    setStatus("reading")
    setError(null)

    try {
      let next: Project
      if (kind === "prproj") {
        const xml = await readPrproj(nextFile)
        next = { kind, xml, version: getProjectVersion(xml) }
      } else {
        const aep = await readAep(nextFile)
        next = {
          kind,
          bytes: aep.bytes,
          version: aep.major,
          plugins: pluginsOf(aep.facts.info.effects),
        }
      }
      // Default to the newest version that's older than the project.
      const older = (kind === "aep" ? AE_OPTIONS : PREMIERE_OPTIONS).find(
        (option) => option.value < next.version
      )
      setTargetVersion(older ? String(older.value) : "")
      setProject(next)
      setStatus("ready")
    } catch (err) {
      setStatus("error")
      setError(
        err instanceof PrprojError || err instanceof AepError
          ? err.message
          : "Something about this file didn't survive the trip. Try a different save of the project."
      )
    }
  }, [])

  const handleDownload = React.useCallback(() => {
    if (!project || !file || isDownloading || noOlderVersions) return

    setIsDownloading(true)
    setDownloadedFileName(null)

    // Yield a tick so the "Repacking…" state actually paints before the sync work runs.
    window.setTimeout(() => {
      try {
        const version = Number(targetVersion)
        const blob =
          project.kind === "prproj"
            ? new Blob(
                [
                  writePrproj(
                    setProjectVersion(project.xml, version)
                  ) as BlobPart,
                ],
                { type: "application/gzip" }
              )
            : new Blob([downgradeAep(project.bytes, version) as BlobPart], {
                type: "application/octet-stream",
              })
        const url = URL.createObjectURL(blob)
        const name = buildOutputName(file.name, project, version)

        const link = document.createElement("a")
        link.href = url
        link.download = name
        link.click()

        URL.revokeObjectURL(url)
        setDownloadedFileName(name)
      } catch (err) {
        setStatus("error")
        setError(
          err instanceof PrprojError || err instanceof AepError
            ? err.message
            : "Repacking failed, but your original file is untouched. Try again."
        )
      } finally {
        setIsDownloading(false)
      }
    }, 30)
  }, [project, file, targetVersion, isDownloading, noOlderVersions])

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (nextFile) void handleFile(nextFile)
    event.target.value = ""
  }

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const nextFile = event.dataTransfer.files?.[0]
    if (nextFile) void handleFile(nextFile)
  }

  const FileIcon = project?.kind === "aep" ? LayersIcon : ClapperboardIcon

  return (
    <>
      <OverscrollMessages />
      <main className="min-h-svh bg-background px-6 py-20 text-foreground">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-16">
          {/* Intro */}
          <header className="flex flex-col gap-3 pt-16">
            <div className="flex items-center gap-3">
              <img
                src="/rewind-icon.svg"
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0"
              />
              <div className="flex flex-col gap-1">
                <h1 className="text-[26px] leading-8 font-medium tracking-[-0.025em] text-foreground/90">
                  Rewind
                </h1>
                <p className="text-[13px] leading-[18px] text-foreground/70">
                  Web Tool · Premiere Pro · After Effects
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 text-[15px] leading-6 text-muted-foreground">
              <p className="text-foreground">Project stuck in the future?</p>
              <p>
                Rewind downgrades Premiere Pro <Code>.prproj</Code> and After
                Effects <Code>.aep</Code> files so you can open them in an older
                version.
              </p>
              <p>
                No uploads. No server. Everything happens locally in your
                browser.
              </p>
            </div>
            <div className="flex flex-col gap-1 pt-1 font-mono text-xs text-muted-foreground/70">
              <p>.prproj → gunzip → patch XML → gzip → .prproj</p>
              <p>.aep → read chunks → patch header, drop new chunks → .aep</p>
            </div>
          </header>

          {/* 01 — Upload */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <SectionMarker>01</SectionMarker>
              <h2 className={sectionHeading}>Drop your project</h2>
              <p className={label}>
                Feed me a <Code>.prproj</Code> or an <Code>.aep</Code>. Drag it
                here, or click like a civilized person.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                id="project-input"
                type="file"
                accept=".prproj,.aep"
                className="sr-only"
                onChange={onInputChange}
              />

              {!file ? (
                <label
                  htmlFor="project-input"
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`flex h-[170px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[24px] border border-dashed bg-card text-center transition-colors duration-200 ${
                    isDragging
                      ? "border-foreground/40"
                      : "border-border hover:border-muted-foreground/40"
                  } focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background`}
                >
                  <UploadIcon className="mb-1 size-5 text-muted-foreground" />
                  <p className="text-[15px] leading-5 font-medium">
                    Choose a project
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    or drag and drop
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    .prproj and .aep only. Everything else gets politely
                    ignored.
                  </p>
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-[24px] border border-border bg-card p-4">
                  <FileIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-5 font-medium">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(file.size)}
                      {status === "reading" && " · Digging through it…"}
                      {status === "ready" &&
                        detectedLabel &&
                        ` · ${detectedLabel}`}
                      {status === "ready" &&
                        !detectedLabel &&
                        " · Unrecognized schema version"}
                      {status === "error" && " · Couldn't read this one"}
                    </p>
                  </div>
                  {status === "reading" ? (
                    <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        onClick={reset}
                        aria-label="Remove file"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {status === "error" && error && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </section>

          {/* 02 — Version */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <SectionMarker>02</SectionMarker>
              <h2 className={sectionHeading}>Pick your escape year</h2>
              <p className={label}>
                Whichever version your client, co-editor, or past self is still
                living in.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={label}>Detected</p>
                <p className="mt-1 text-[15px] leading-6 font-medium">
                  {status === "ready" ? (detectedLabel ?? "Unrecognized") : "—"}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="target-version" className={label}>
                  Open with
                </Label>
                <Select
                  value={targetVersion}
                  disabled={status !== "ready" || noOlderVersions}
                  onValueChange={(value) => {
                    if (value) setTargetVersion(value)
                  }}
                >
                  <SelectTrigger
                    id="target-version"
                    className="w-full rounded-full sm:w-[220px]"
                  >
                    <SelectValue>
                      {(value: string | null) =>
                        options.find((o) => String(o.value) === value)?.label ??
                        "—"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {noOlderVersions && (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                This project is already on the oldest version Rewind supports.
                There's nowhere further back to go.
              </p>
            )}

            {status === "ready" && project?.kind === "aep" && target && (
              <div className="flex flex-col gap-1 text-[13px] leading-[18px] text-muted-foreground">
                {project.version - target.value > 1 && (
                  <p>
                    Jumping back {project.version - target.value} versions. The
                    further back, the more likely something new gets dropped on
                    the way.
                  </p>
                )}
                {!target.tested && (
                  <p>
                    {target.label} hasn't been tested yet. Open it there and
                    check before you hand it off.
                  </p>
                )}
                {project.plugins.length > 0 && (
                  <p>
                    Uses {project.plugins.join(", ")}. Install{" "}
                    {project.plugins.length === 1 ? "it" : "them"} in{" "}
                    {target.label} too.
                  </p>
                )}
              </div>
            )}

            {status === "ready" && project?.kind === "prproj" && (
              <details className="text-xs text-muted-foreground/70">
                <summary className="cursor-pointer select-none hover:text-muted-foreground">
                  Show schema numbers
                </summary>
                <p className="mt-1.5 tabular-nums">
                  Project schema: {project.version} → {targetVersion}
                </p>
              </details>
            )}
          </section>

          {/* 03 — Download */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <SectionMarker>03</SectionMarker>
              <h2 className={sectionHeading}>Get the downgraded project</h2>
              <p className={label}>
                Rewind cracks open the project, changes the version it reports,
                puts everything back together, and hands it back to you.
              </p>
            </div>

            <div>
              <Button
                size="lg"
                className="h-10 w-full rounded-full px-5 sm:w-auto"
                disabled={
                  status !== "ready" || isDownloading || noOlderVersions
                }
                onClick={handleDownload}
              >
                {isDownloading ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <DownloadIcon />
                )}
                {isDownloading ? "Repacking project…" : "Downgrade & Download"}
              </Button>

              {downloadedFileName && !isDownloading && (
                <div className="mt-3 flex items-start gap-2 text-sm">
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
                  <div>
                    <p className="text-foreground">
                      Done. Adobe archaeology complete.
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Code>{downloadedFileName}</Code>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <ul className="space-y-1 pt-2 text-xs text-muted-foreground/70">
              <li>No terminal.</li>
              <li>No gunzip, no hex editor.</li>
              <li>
                No hunting through XML for <Code>Version="46"</Code>.
              </li>
              <li>No gzip ritual afterward.</li>
            </ul>
          </section>

          {/* Privacy */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <LockIcon className="size-4 text-muted-foreground" />
              <h2 className={sectionHeading}>Your file stays yours</h2>
            </div>
            <p className="text-[15px] leading-6 text-muted-foreground">
              The entire process runs inside your browser. Your project never
              gets uploaded anywhere.
            </p>
            <p className="text-[15px] leading-6 text-muted-foreground">
              Mostly because privacy is good. Also because I really do not want
              your project files.
            </p>
          </section>

          {/* Warning */}
          <section className="rounded-[24px] border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <TriangleAlertIcon className="size-4 text-muted-foreground" />
              <h2 className="text-[15px] leading-5 font-medium">
                One small warning
              </h2>
            </div>
            <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
              Rewind changes the version the project reports. It doesn't make
              newer features work in an older release.
            </p>
            <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
              For After Effects, Rewind also drops the bits an older version
              wouldn't recognize. If After Effects can save a copy for the
              version you need (File → Save As → Save a Copy As), that's still
              the safest way.
            </p>
            <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
              Save a backup first.
            </p>
          </section>

          <ul className="flex flex-wrap gap-2">
            <li>
              <a href={STORY_URL} className={pill}>
                How I built it ↗
              </a>
            </li>
            <li>
              <a href={SITE_URL} className={pill}>
                Back to portfolio ↗
              </a>
            </li>
          </ul>

          <SiteFooter />
        </div>
      </main>
    </>
  )
}

export default App
