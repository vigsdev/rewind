import * as React from "react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClapperboardIcon,
  DownloadIcon,
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
  getProjectVersion,
  PrprojError,
  readPrproj,
  setProjectVersion,
  writePrproj,
} from "@/lib/prproj"
import { getVersionLabel, PRPROJ_VERSIONS } from "@/lib/versions"

type Status = "idle" | "reading" | "ready" | "error"

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

function buildOutputName(originalName: string, targetVersion: number) {
  const base = originalName.replace(/\.prproj$/i, "")
  return `${base}_v${targetVersion}.prproj`
}

function toPremiereLabel(label: string) {
  return label.replace(/^CC /, "Premiere Pro ")
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
  const [xml, setXml] = React.useState<string | null>(null)
  const [detectedVersion, setDetectedVersion] = React.useState<number | null>(
    null
  )
  const [targetVersion, setTargetVersion] = React.useState(
    String(PRPROJ_VERSIONS[PRPROJ_VERSIONS.length - 1].version)
  )
  const [status, setStatus] = React.useState<Status>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [downloadedFileName, setDownloadedFileName] = React.useState<
    string | null
  >(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const detectedLabel =
    detectedVersion !== null ? getVersionLabel(detectedVersion) : undefined

  const availableVersions = React.useMemo(() => {
    if (detectedVersion === null) return PRPROJ_VERSIONS
    return PRPROJ_VERSIONS.filter((option) => option.version < detectedVersion)
  }, [detectedVersion])

  const noOlderVersions = status === "ready" && availableVersions.length === 0

  React.useEffect(() => {
    if (status === "ready" && availableVersions.length > 0) {
      setTargetVersion(String(availableVersions[0].version))
    }
  }, [status, availableVersions])

  const reset = React.useCallback(() => {
    setFile(null)
    setXml(null)
    setDetectedVersion(null)
    setStatus("idle")
    setError(null)
    setIsDownloading(false)
    setDownloadedFileName(null)
  }, [])

  const handleFile = React.useCallback(async (nextFile: File) => {
    if (!nextFile.name.toLowerCase().endsWith(".prproj")) {
      setFile(nextFile)
      setXml(null)
      setDetectedVersion(null)
      setStatus("error")
      setError("That doesn't look like a .prproj file. Try another one.")
      return
    }

    setFile(nextFile)
    setStatus("reading")
    setError(null)
    setDownloadedFileName(null)

    try {
      const text = await readPrproj(nextFile)
      const version = getProjectVersion(text)
      setXml(text)
      setDetectedVersion(version)
      setStatus("ready")
    } catch (err) {
      setXml(null)
      setDetectedVersion(null)
      setStatus("error")
      setError(
        err instanceof PrprojError
          ? err.message
          : "Something about this file didn't survive the trip. Try a different export of the project."
      )
    }
  }, [])

  const handleDownload = React.useCallback(() => {
    if (!xml || !file || isDownloading || noOlderVersions) return

    setIsDownloading(true)
    setDownloadedFileName(null)

    // Yield a tick so the "Repacking…" state actually paints before the sync gzip work runs.
    window.setTimeout(() => {
      try {
        const version = Number(targetVersion)
        const downgradedXml = setProjectVersion(xml, version)
        const bytes = writePrproj(downgradedXml)
        const blob = new Blob([bytes as BlobPart], {
          type: "application/gzip",
        })
        const url = URL.createObjectURL(blob)
        const name = buildOutputName(file.name, version)

        const link = document.createElement("a")
        link.href = url
        link.download = name
        link.click()

        URL.revokeObjectURL(url)
        setDownloadedFileName(name)
      } catch (err) {
        setStatus("error")
        setError(
          err instanceof PrprojError
            ? err.message
            : "Repacking failed, but your original file is untouched. Try again."
        )
      } finally {
        setIsDownloading(false)
      }
    }, 30)
  }, [xml, file, targetVersion, isDownloading, noOlderVersions])

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
                <p className="text-[13px] leading-[18px] text-foreground/70 italic">
                  Web Tool · Premiere Pro
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 text-[15px] leading-6 text-muted-foreground">
              <p className="text-foreground">
                Premiere project stuck in the future?
              </p>
              <p>
                Rewind downgrades <Code>.prproj</Code> files so you can try
                opening them in an older version of Premiere Pro.
              </p>
              <p>
                No uploads. No server. Everything happens locally in your
                browser.
              </p>
            </div>
            <p className="pt-1 font-mono text-xs text-muted-foreground/70">
              .prproj → gunzip → patch XML → gzip → .prproj
            </p>
          </header>

          {/* 01 — Upload */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <SectionMarker>01</SectionMarker>
              <h2 className={sectionHeading}>Drop your project</h2>
              <p className={label}>
                Feed me a <Code>.prproj</Code>. Drag it here, or click like a
                civilized person.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                id="prproj-input"
                type="file"
                accept=".prproj"
                className="sr-only"
                onChange={onInputChange}
              />

              {!file ? (
                <label
                  htmlFor="prproj-input"
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
                    Choose a .prproj
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    or drag and drop
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    .prproj only. Everything else gets politely ignored.
                  </p>
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-[24px] border border-border bg-card p-4">
                  <ClapperboardIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-5 font-medium">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(file.size)}
                      {status === "reading" && " · Digging through the gzip…"}
                      {status === "ready" &&
                        detectedLabel &&
                        ` · ${toPremiereLabel(detectedLabel)}`}
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
                  {status === "ready"
                    ? detectedLabel
                      ? toPremiereLabel(detectedLabel)
                      : "Unrecognized"
                    : "—"}
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
                      {(value: string | null) => {
                        const option = PRPROJ_VERSIONS.find(
                          (v) => String(v.version) === value
                        )
                        return option ? toPremiereLabel(option.label) : value
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableVersions.map((option) => (
                      <SelectItem
                        key={option.version}
                        value={String(option.version)}
                      >
                        {toPremiereLabel(option.label)}
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

            {status === "ready" && detectedVersion !== null && (
              <details className="text-xs text-muted-foreground/70">
                <summary className="cursor-pointer select-none hover:text-muted-foreground">
                  Show schema numbers
                </summary>
                <p className="mt-1.5 tabular-nums">
                  Project schema: {detectedVersion} → {targetVersion}
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
              <li>No gunzip.</li>
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
              The entire process runs inside your browser. Your{" "}
              <Code>.prproj</Code> never gets uploaded anywhere.
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
              newer Premiere features work in an older release.
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
