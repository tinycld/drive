---
title: Drive rules
summary: File and react to documents automatically
tags: [rules, automation, workflow, folders]
order: 100
---

Drive takes part in [automation rules](help://core:rules) with two triggers and
an action for filing things away.

## When a file is added

The trigger **A file is added** fires for anything new in your drive — an
upload, a new document or spreadsheet, or a folder. You can filter on name,
type, size, whether it's a folder, and which folder it landed in.

Two filters do most of the work:

- **Folder** — react only to things arriving somewhere specific, which is what
  makes an auto-filing rule possible.
- **Type** — react only to PDFs, images, spreadsheets, and so on. This is also
  how you catch a new document or workbook being created, since those are drive
  items too.

## When you're mentioned in a comment

The trigger **I'm mentioned in a comment** fires when someone @-mentions you —
in a document, a spreadsheet, or a comment on any other file. One rule covers
all three, because drive stores every mention regardless of what was commented
on.

Pair it with a notification, or with an action from another package.

## Filing things away

The action **Move to folder** moves the file that started the rule into a
folder you pick. It only ever moves that file — a rule can't reach out and move
something else.

## Recipes

**Auto-file invoices.** When a file is added, if the folder is Inbox and the
name contains `invoice`, move it to Invoices. Anything scanned or dropped into
Inbox sorts itself.

**Keep an eye on large uploads.** When a file is added, if the size is greater
than some threshold, send yourself a notification.

**Never miss a mention.** When you're mentioned in a comment, send yourself a
notification. Useful if you don't keep the app open.

## What rules can't do yet

- **Editing content.** Rules react to a file being *added*, not to its contents
  changing. Document and spreadsheet edits are collaborative operations rather
  than record changes, so they're invisible to rules.
- **Timing.** There's no way to say "if this hasn't been opened in 30 days" —
  rules react to events as they happen, not to time passing.
- **Acting on a different file.** Move to folder applies to the file that
  started the rule. A rule can't find some other file and move it.
