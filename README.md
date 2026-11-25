# Rewind

Open a Premiere Pro or After Effects project in an older version.

**Use it:** [labs.vigs.dev/rewind](https://labs.vigs.dev/rewind)

Premiere and After Effects won't open a project saved in a newer version. Rewind rewrites the project so an older version will open it. Drop in a `.prproj` or an `.aep`, pick the version you have, and download the new file.

It runs in your browser. The file never leaves your computer: no uploads, no server, no account.

## Versions

| Premiere Pro | Project version |
|---|---|
| CC 2026 | 46 |
| CC 2025 | 45 |
| CC 2024 | 44 |
| CC 2023 | 43 |

| After Effects | File format | Tested |
|---|---|---|
| 2027 | `0x62` | |
| 2026 | `0x61` | Yes, from 2027 |
| 2025 | `0x60` | Not yet |
| 2024 | `0x5F` | Not yet |

## Good to know

- **Keep your original.** Rewind gives you a new file and leaves yours untouched, but work on a copy anyway.
- **It isn't a real conversion.** For Premiere, only the version number changes. Effects, features or settings that the older Premiere doesn't know about may be dropped or show up as missing when it opens the project.
- **No guarantees.** Most projects open fine. Some won't, especially ones that lean on features added in newer versions.

## How it works

A `.prproj` is gzipped XML. Rewind unzips it, changes the `Version` on the root `<Project>` element, and zips it again:

```
.prproj → gunzip → patch XML → gzip → .prproj
```

An `.aep` is a RIFX file: binary chunks, some holding more chunks. Rewind reads it with [aep-facts](https://github.com/vigsdev/aep-facts), then rewrites the chunk tree:

- the `head` chunk gets the older version's file format and app version
- chunks the older version doesn't know are dropped: from 2026, a `GdV2` list on every layer and an empty `ADBE3D Material Parade` property group; from 2025, an `sdfl` settings list and a flag on Position and Anchor Point

```
.aep → read chunks → patch header, drop new chunks → .aep
```

These were found by saving the same project in After Effects 2024, 2025, 2026 and 2027 and comparing the files. A project that uses features added in a newer version may still have parts the older one can't read. If After Effects can save a copy for the version you need (File → Save As → Save a Copy As), that's the safest way.

## Run it locally

```bash
npm install
npm run dev
```

Built with React, TypeScript, Vite, Tailwind, [fflate](https://github.com/101arrowz/fflate) and [aep-facts](https://www.npmjs.com/package/aep-facts).

---

Part of [Lab](https://labs.vigs.dev), small tools by [Vigs](https://vigs.dev).
