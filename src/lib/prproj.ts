import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate"

// ClassID of the root <Project> element that carries the schema Version attribute.
const PROJECT_CLASS_ID = "62ad66dd-0dcd-42da-a660-6d8fbde94876"

const PROJECT_TAG_RE = new RegExp(
  `<Project\\b[^>]*ClassID="${PROJECT_CLASS_ID}"[^>]*>`
)
const VERSION_ATTR_RE = /Version="(\d+)"/

export class PrprojError extends Error {}

/** Decompresses a .prproj file (gzip) into its raw XML text. */
export async function readPrproj(file: File): Promise<string> {
  const compressed = new Uint8Array(await file.arrayBuffer())

  let decompressed: Uint8Array
  try {
    decompressed = gunzipSync(compressed)
  } catch {
    throw new PrprojError(
      "That doesn't look like a Premiere project. Try another .prproj file."
    )
  }

  return strFromU8(decompressed)
}

/** Recompresses XML text back into .prproj (gzip) bytes. */
export function writePrproj(xml: string): Uint8Array {
  return gzipSync(strToU8(xml), { level: 9 })
}

/** Reads the current schema Version from the root <Project> element without modifying it. */
export function getProjectVersion(xml: string): number {
  const tag = xml.match(PROJECT_TAG_RE)?.[0]
  const version = tag && tag.match(VERSION_ATTR_RE)?.[1]

  if (!version) {
    throw new PrprojError(
      "We opened the file, but couldn't find Premiere's project data. Check that it isn't damaged."
    )
  }

  return Number(version)
}

/** Rewrites the root <Project> element's Version attribute to the target schema version. */
export function setProjectVersion(xml: string, targetVersion: number): string {
  const match = xml.match(PROJECT_TAG_RE)
  if (!match || match.index === undefined) {
    throw new PrprojError(
      "We opened the file, but couldn't find Premiere's project data. Check that it isn't damaged."
    )
  }

  const tag = match[0]
  if (!VERSION_ATTR_RE.test(tag)) {
    throw new PrprojError(
      "Found Premiere's project data, but no version number to change. Check that the file isn't damaged."
    )
  }

  const newTag = tag.replace(VERSION_ATTR_RE, `Version="${targetVersion}"`)
  return (
    xml.slice(0, match.index) + newTag + xml.slice(match.index + tag.length)
  )
}
