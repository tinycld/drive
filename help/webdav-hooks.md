---
title: Customizing WebDAV behavior
summary: Block or hide files over WebDAV with a server-side TypeScript hook
tags: [webdav, hooks, typescript, customize, admin]
order: 115
---

## What this is for

Drive's WebDAV server enforces the same access rules as the web UI: you see what you own or what has been shared with you. Some deployments need more — blocking a file type, hiding scratch files from every listing, refusing deletes inside a retention folder.

You can add rules like that in TypeScript, without changing Drive itself. This is an administrator-level task: it requires access to the server's `pb-hooks/` directory.

> **Nothing is enabled by default.** A deployment that adds no hooks runs Drive's normal path with no overhead at all — the rules below cost nothing until you write one.

## Where the code goes

Create or edit a `.pb.ts` file in Drive's `pb-hooks/` directory, and call `webdavHook` with the points you want:

```ts
webdavHook({
    beforeWrite(e) {
        if (e.name.endsWith('.exe')) {
            throw new Error('executables are not allowed in Drive')
        }
    },
    filterList(e) {
        return e.items.filter(function (n) { return n[0] !== '.' })
    },
})
```

Restart the server to pick up changes.

## The five points

| Point | Fires on | What it receives | What it can do |
|---|---|---|---|
| `beforeWrite` | uploading a file or creating a folder | `name`, `path`, `userId`, `isCreate` | throw to reject |
| `beforeDelete` | deleting | `id`, `name`, `path`, `userId` | throw to reject |
| `beforeMove` | moving or renaming | `id`, `name`, `from`, `to`, `userId` | throw to reject |
| `canRead` | each entry in a listing | `id`, `name`, `userId` | return `false` to hide it |
| `filterList` | each directory listing | `items` (the names) | return the names to keep |

The message you throw reaches the server log, so make it explain the rule.

## What a hook cannot do

**A hook can only take access away, never grant it.** Drive checks its own permissions first, so `canRead` is asked about entries you could already see, and any name `filterList` returns that Drive did not authorize is discarded. There is no way to widen access from a hook — which means a mistake here can hide files, but cannot expose someone else's.

Two practical limits:

- A handler must be **self-contained**. Anything it needs has to live inside its own body — a `const` or helper function declared at the top of the file is not visible when the handler runs.
- Handlers are **synchronous**. Don't use `async` or return a Promise.

## Performance

`filterList` is called once per directory with the whole batch of names, not once per file, so filtering a large folder costs one call. `canRead` is called per entry, so prefer `filterList` when you can express the rule as a filter over names.

## Examples

Block a file type:

```ts
webdavHook({
    beforeWrite(e) {
        if (/\.(exe|dll|scr)$/i.test(e.name)) {
            throw new Error('this file type is not permitted')
        }
    },
})
```

Protect a folder from deletion:

```ts
webdavHook({
    beforeDelete(e) {
        if (e.path.indexOf('/Retention/') === 0) {
            throw new Error('items under Retention cannot be deleted')
        }
    },
})
```

Hide editor scratch files from every listing:

```ts
webdavHook({
    filterList(e) {
        return e.items.filter(function (n) {
            return n !== '.DS_Store' && n.slice(-1) !== '~'
        })
    },
})
```
