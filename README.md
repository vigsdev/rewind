# Rewind

Open a Premiere Pro project in an older version of Premiere.

**Use it:** [labs.vigs.dev/rewind](https://labs.vigs.dev/rewind)

Premiere won't open a project saved in a newer version. Rewind changes the project's version number so an older Premiere will try to open it. Drop in a `.prproj`, pick the version you have, and download the new file.

It runs in your browser. The file never leaves your computer: no uploads, no server, no account.

## Versions

| Premiere Pro | Project version |
|---|---|
| CC 2026 | 46 |
| CC 2025 | 45 |
| CC 2024 | 44 |
| CC 2023 | 43 |

## Good to know

- **Keep your original.** Rewind gives you a new file and leaves yours untouched, but work on a copy anyway.
- **It isn't a real conversion.** Only the version number changes. Effects, features or settings that the older Premiere doesn't know about may be dropped or show up as missing when it opens the project.
- **No guarantees.** Most projects open fine. Some won't, especially ones that lean on features added in newer versions.

## How it works

A `.prproj` is gzipped XML. Rewind unzips it, changes the `Version` on the root `<Project>` element, and zips it again:

```
.prproj → gunzip → patch XML → gzip → .prproj
```

## Run it locally

```bash
npm install
npm run dev
```

Built with React, TypeScript, Vite, Tailwind and [fflate](https://github.com/101arrowz/fflate).

---

Part of [Lab](https://labs.vigs.dev), small tools by [Vigs](https://vigs.dev).
