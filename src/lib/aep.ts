import init, { inspect, type Inspected } from "aep-facts"

// An .aep is a RIFX file (big-endian RIFF): chunks with a 4-letter id and a
// size, and LIST chunks that hold more chunks. Going back a version means two
// things: the `head` chunk has to say the older version, and chunks the older
// version doesn't know have to go. Worked out by comparing the same project
// saved by After Effects 2024, 2025, 2026 and 2027.

export class AepError extends Error {}

export interface AepVersion {
  major: number
  /** The first 8 bytes of `head` as this version writes them: file format, revision, app version. */
  head: [number, number]
  /** Opened in this version after a downgrade from the next one up. */
  tested: boolean
}

// Newest first. The file format number goes up by one each year: 0x5f is 2024.
export const AEP_VERSIONS: AepVersion[] = [
  { major: 27, head: [0x00620006, 0x0f98064e], tested: true },
  { major: 26, head: [0x0061000b, 0x0f928650], tested: true },
  { major: 25, head: [0x00600009, 0x0f8b0661], tested: false },
  { major: 24, head: [0x005f0006, 0x0f830641], tested: false },
]

const NEWEST = AEP_VERSIONS[0].major
const OLDEST = AEP_VERSIONS[AEP_VERSIONS.length - 1].major

export const aeLabel = (major: number) => `After Effects 20${major}`

export interface AepProject {
  bytes: Uint8Array
  major: number
  facts: Inspected
}

let ready: Promise<unknown> | undefined

/** Reads the version and what's inside with aep-facts, and checks Rewind knows this format. */
export async function readAep(file: File): Promise<AepProject> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || tag(0) !== "RIFX" || tag(8) !== "Egg!") {
    throw new AepError(
      "That doesn't look like an After Effects project. Try another .aep file."
    )
  }

  ready ??= init()
  await ready
  let facts: Inspected
  try {
    facts = inspect(bytes)
  } catch {
    throw new AepError(
      "We opened the file, but couldn't read After Effects' project data. Check that it isn't damaged."
    )
  }

  const major = facts.info.major
  if (major === null) {
    throw new AepError(
      "Couldn't find which version of After Effects saved this. Check that the file isn't damaged."
    )
  }
  if (major > NEWEST) {
    throw new AepError(
      `This was saved by ${aeLabel(major)}, newer than Rewind knows. It'll learn soon.`
    )
  }
  if (major < OLDEST) {
    throw new AepError(
      `This was saved by ${aeLabel(major)}. Rewind goes back to ${aeLabel(OLDEST)}, so there's nothing to do here.`
    )
  }
  return { bytes, major, facts }
}

type Node =
  | { id: string; data: Uint8Array }
  | { id: string; type: string; kids: Node[] }
  | { id: string; type: string; raw: Uint8Array }

const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength)
const ascii = (b: Uint8Array, at: number) =>
  String.fromCharCode(...b.subarray(at, at + 4))

function parse(b: Uint8Array, start: number, end: number): Node[] {
  const nodes: Node[] = []
  let at = start
  while (at + 8 <= end) {
    const id = ascii(b, at)
    const size = view(b).getUint32(at + 4)
    const data = at + 8
    if (data + size > end)
      throw new AepError("This project file is cut short. Try a fresh save.")
    if (id === "LIST") {
      const type = ascii(b, data)
      const inner = b.subarray(data + 4, data + size)
      // btdk holds text layer data, no chunks inside.
      nodes.push(
        type === "btdk"
          ? { id, type, raw: inner }
          : { id, type, kids: parse(b, data + 4, data + size) }
      )
    } else {
      nodes.push({ id, data: b.slice(data, data + size) })
    }
    at = data + size + (size & 1)
  }
  return nodes
}

function bodyOf(node: Node): Uint8Array {
  if ("data" in node) return node.data
  const inner = "raw" in node ? node.raw : serialize(node.kids)
  const body = new Uint8Array(4 + inner.length)
  for (let i = 0; i < 4; i++) body[i] = node.type.charCodeAt(i)
  body.set(inner, 4)
  return body
}

function serialize(nodes: Node[]): Uint8Array {
  const parts = nodes.map((node) => {
    const body = bodyOf(node)
    const out = new Uint8Array(8 + body.length + (body.length & 1))
    for (let i = 0; i < 4; i++) out[i] = node.id.charCodeAt(i)
    view(out).setUint32(4, body.length)
    out.set(body, 8)
    return out
  })
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const nameOf = (data: Uint8Array) =>
  String.fromCharCode(...data).replace(/\0.*$/s, "")

function rewrite(nodes: Node[], target: AepVersion): Node[] {
  const out: Node[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const type = "type" in node ? node.type : null

    // 2026 added a guides list (GdV2) to every layer.
    if (target.major <= 25 && type === "GdV2") continue
    // 2025 added a settings list (sdfl) at the top of the project.
    if (target.major <= 24 && type === "sdfl") continue
    // 2026 added an empty property group to every layer: its name, then the group.
    const next = nodes[i + 1]
    if (
      target.major <= 25 &&
      "data" in node &&
      node.id === "tdmn" &&
      nameOf(node.data) === "ADBE3D Material Parade" &&
      next &&
      "type" in next &&
      next.type === "tdgp"
    ) {
      i++
      continue
    }

    if ("data" in node) {
      // 2025 added a flag on Position and Anchor Point that 2024 writes as 0.
      if (
        target.major <= 24 &&
        node.id === "tdb4" &&
        node.data.length === 124
      ) {
        node.data[119] = 0
      }
      if (node.id === "head" && node.data.length >= 8) {
        view(node.data).setUint32(0, target.head[0])
        view(node.data).setUint32(4, target.head[1])
      }
    } else if ("kids" in node) {
      node.kids = rewrite(node.kids, target)
    }
    out.push(node)
  }
  return out
}

/** The project as `major` would have saved it. The XMP metadata after the chunks is kept as is. */
export function downgradeAep(bytes: Uint8Array, major: number): Uint8Array {
  const target = AEP_VERSIONS.find((v) => v.major === major)
  if (!target) throw new AepError(`Rewind can't write ${aeLabel(major)} files.`)

  const formEnd = Math.min(8 + view(bytes).getUint32(4), bytes.length)
  const root: Node = {
    id: "RIFX",
    type: ascii(bytes, 8),
    kids: rewrite(parse(bytes, 12, formEnd), target),
  }
  const chunks = serialize([root])
  const rest = bytes.subarray(formEnd + (formEnd & 1))
  const out = new Uint8Array(chunks.length + rest.length)
  out.set(chunks)
  out.set(rest, chunks.length)
  return out
}
