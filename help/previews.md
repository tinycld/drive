---
title: Previewing files
summary: Viewing files in the browser without downloading
tags: [preview, view, pdf, image, video]
order: 50
---

## What can be previewed

Drive can preview common file types in-app — no download needed:

- **PDFs** — rendered page-by-page in a canvas viewer with zoom and page navigation.
- **Images** — JPG, PNG, GIF, WebP, SVG, HEIC.
- **Video** — MP4, MOV, WebM, with native HTML5 controls.
- **Audio** — MP3, WAV, AAC, FLAC, with native playback controls.
- **Text and code** — plain text, source code, JSON, YAML, Markdown.

Anything else opens the **Info** panel — there's no in-app viewer, so you'll need to download to view.

## Custom previewers

Some packages register their own openers and replace the default for a specific file type. The most common example: a `.xlsx` opens directly in [Calc](help://calc:getting-started) rather than in a generic preview — double-clicking or tapping the file takes you straight to that app's editor. For files with a custom opener, the context menu offers both **Open in &lt;package&gt;** (to jump to the editor) and **Preview** (to view the file inline without leaving Drive).

## In the preview modal

The preview opens in an overlay above Drive. While it's open:

- **Arrow keys** (or swipe on iPad) move between adjacent files in the current view.
- **Esc** closes the preview.
- A toolbar at the top has **Download**, **Share**, **Info**, **Star**, and **Move to trash** so you can act on the file without closing first.

## Thumbnails

In Grid view, every file shows a thumbnail. For images and videos, that's a downscaled version of the file. For PDFs, it's the first page. For other types, it's a category icon. Thumbnails are generated on the server when a file is uploaded, so they appear shortly after upload completes, not instantly.

## See also

- [Files](help://drive:files)
- [Folders](help://drive:folders)
