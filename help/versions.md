---
title: Version history
summary: See earlier versions of a file, label them, and restore one
tags: [versions, history, restore, label]
order: 60
---

## Open version history

You can open the history of a file in two ways:

- In Drive, select the file, open the **Info** panel, choose the **Versions** tab, and click **Open version history**.
- In a document, choose **File → Version history**.

The history opens full screen. The list of versions is on the right, grouped by day, newest first. On a phone, the list fills the screen. Tap a version to see it, and tap **Back** to return to the list.

Each version shows its label or the time it was made, the people who made it, and a tag:

- **Auto**: Drive made the version automatically. It names the people who edited since the version before it.
- **Saved**: someone chose **File → Save version**.
- **Upload**: someone uploaded a new version of the file.

## Preview a version

Click a version in the list to see it. The preview is read-only. Your current document does not change.

Some file types have no preview. For these, the history shows **Download** so you can open that version on your device.

## Compare versions

Select a version, then choose what the preview shows:

- **vs. current**: the document as it is now, with the changes since the selected version marked. Edits that are not saved as a version yet are included. Use this before you restore, to see what a restore would undo.
- **vs. previous**: the selected version, with the changes since the version just before it marked.
- **Version**: the selected version without marks.

In a compare:

- Added text has a green background.
- Removed text has a red background and a line through it.
- A bar at the left marks a paragraph where only the formatting changed.
- When a table, an image or a link changed, the old block shows as removed and the new block as added.

Everyone who can open the file can compare versions. Compare is not available for every file type.

## Label a version

To give a version a name, such as "Initial draft" or "Approved":

1. Select the version.
2. Click **Rename**.
3. Type the label. A label can have up to 500 characters.
4. Click **Save**.

To remove a label, rename the version and leave the field empty.

## Restore a version

1. Select the version.
2. Click **Restore**, then confirm.

The file goes back to the content of that version. The history keeps every version:

- The state before the restore is kept as a version in the list, with all edits up to that moment. You can restore it again.
- A new version named "Restored from …" appears at the top of the list.

If other people have the document open, their editors change to the restored content at once.

The file name, its folder, its share settings and its links do not change.

## Download a version

In the **Info** panel's **Versions** tab, click the download icon next to a version. You get only that version's file. The current file does not change.

## When automatic versions are made

For a document that people edit in the app, Drive makes a version automatically:

- after 10 minutes with no edits, and
- when the last person closes the document.

Drive makes an automatic version only if something changed since the last version. Typing does not make a version for each change.

## How long versions are kept

These versions are kept until the file is permanently deleted:

- versions you saved with **File → Save version**,
- uploaded versions,
- any version that has a label.

Automatic versions without a label are thinned as they get older:

| Age of the version | What is kept |
|---|---|
| Up to 7 days | All automatic versions |
| 7 to 90 days | One per day: the last version of that day |
| More than 90 days | One per week: the last version of that week |

Example: you edit a document on many days for four months. On each day, Drive makes several automatic versions.

- The versions from the last 7 days are all there.
- From 7 to 90 days ago, there is one version for each day that you edited.
- From before that, there is one version for each week that you edited.

Thinning runs once a day.

### Keep a version forever

To keep an automatic version forever, give it a label (see **Label a version**). If you remove the label later, the version is thinned again by the rules above.

### Who edited

When Drive thins a version, the names of the people who edited it move to the next newer version that is kept. So the history still shows everyone who changed the document.

### The state a restore replaces

Before each restore, Drive keeps the state you replace as an automatic version, with all edits up to that moment. It is thinned like other automatic versions. To keep it forever, give it a label.

### Storage

A version counts against the storage of the person who made it:

- An automatic version counts against the file's owner.
- A version from **Save version**, an upload or a restore counts against the person who did it.

While the owner is over their storage limit, Drive does not make automatic versions. Editing still works. **Save version**, uploads and restores follow the usual storage limit.

### What a restore brings back

A restore brings back the content of the version and the suggestions saved in it. The restored text counts as a new change, so its author colors are not kept.

## When the file is deleted

When you move a file to [Trash](help://drive:trash), its history stays. Restore the file from the trash, and the full history comes back. When you delete a file permanently, all of its versions are deleted too.

## See also

- [Files](help://drive:files)
- [Uploading](help://drive:uploading)
- [Saving a version in a document](help://text:save-version)
