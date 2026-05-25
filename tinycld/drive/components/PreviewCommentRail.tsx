import {
    type CommentAnchor,
    HtmlSurface,
} from '@tinycld/core/file-viewer/HtmlSurface'
import { getPublicPreviewConfig } from '@tinycld/core/file-viewer/registry'
import { usePublicRenderedHtml } from '@tinycld/core/file-viewer/fetch-rendered-html'
import type { ShareSession } from '@tinycld/core/lib/anon-identity'
import { buildThreads, groupCommentsByKey, type BaseCommentRow } from '@tinycld/core/lib/comments'
import {
    type PreviewCommentAnchor,
    type PreviewCommentRow,
    usePreviewComments,
} from '@tinycld/core/lib/comments/preview-comments'
import {
    CommentComposer,
    CommentDrawer,
    type CommentDrawerGroup,
} from '@tinycld/core/ui/comments'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

export interface PreviewCommentRailProps {
    session: ShareSession
}

// A preview comment mapped into the shared BaseCommentRow shape the
// drawer/thread helpers expect. `author` is synthesized from whichever
// id authored the row so ownership checks (author === currentActorId)
// work for both anon and org-member authors.
interface RailRow extends BaseCommentRow {
    anchor_kind: 'calc_cell' | 'text_range'
    anchor: PreviewCommentRow['anchor']
    quoted_text: string
}

function toRailRow(r: PreviewCommentRow): RailRow {
    return {
        id: r.id,
        drive_item: r.drive_item,
        parent_comment: r.parent_comment,
        body: r.body,
        resolved_at: r.resolved_at,
        author: r.author_user_org || r.author_anon_id,
        author_name: r.author_name,
        created: r.created,
        anchor_kind: r.anchor_kind,
        anchor: r.anchor,
        quoted_text: r.quoted_text,
    }
}

// anchorKey derives a stable grouping key from a row's anchor so all
// comments on the same cell / text range cluster into one thread group.
function anchorKey(r: RailRow): string {
    if (r.anchor_kind === 'calc_cell' && r.anchor && 'row' in r.anchor) {
        return `calc:${r.anchor.row}:${r.anchor.col}`
    }
    if (r.anchor_kind === 'text_range' && r.anchor && 'start' in r.anchor) {
        return `text:${r.anchor.start}:${r.anchor.end}`
    }
    return `orphan:${r.id}`
}

function anchorLabel(r: RailRow): string {
    if (r.anchor_kind === 'calc_cell' && r.anchor && 'col' in r.anchor) {
        return `${r.anchor.col}${r.anchor.row}`
    }
    return r.quoted_text ? `“${r.quoted_text.slice(0, 40)}”` : 'Selection'
}

// PreviewCommentRail renders the read-only document preview (with
// click/selection anchoring) beside a comments drawer. Anonymous
// visitors and logged-in members both author through the same
// share-comment endpoints.
export function PreviewCommentRail({ session }: PreviewCommentRailProps) {
    const config = getPublicPreviewConfig(session.mimeType)
    const render = usePublicRenderedHtml(session.sessionToken, session.mimeType, !!config)
    const comments = usePreviewComments(session.itemId, {
        sessionToken: session.sessionToken,
        currentActorId: session.anonId,
    })

    // Pending anchor the visitor just clicked/selected, awaiting a body.
    const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(true)

    const rows = useMemo(() => comments.comments.map(toRailRow), [comments.comments])

    const groups = useMemo<CommentDrawerGroup<RailRow>[]>(() => {
        const byAnchor = groupCommentsByKey(rows, anchorKey)
        const out: CommentDrawerGroup<RailRow>[] = []
        for (const [key, anchorRows] of byAnchor) {
            const threads = buildThreads(anchorRows)
            if (threads.length === 0) continue
            out.push({
                key,
                label: anchorLabel(anchorRows[0]),
                threads,
            })
        }
        return out
    }, [rows])

    const submitNewComment = (body: string) => {
        if (!pendingAnchor) return
        const anchor: PreviewCommentAnchor =
            pendingAnchor.kind === 'calc_cell'
                ? { col: pendingAnchor.col, row: Number(pendingAnchor.row) }
                : { start: pendingAnchor.start, end: pendingAnchor.end }
        comments.add.mutate({
            anchorKind: pendingAnchor.kind,
            anchor,
            quotedText: pendingAnchor.quoted,
            body,
        })
        setPendingAnchor(null)
    }

    if (!config) {
        return (
            <Centered>
                <Text className="text-sm text-muted-foreground">
                    This file type can&apos;t be previewed.
                </Text>
            </Centered>
        )
    }

    return (
        <View className="flex-1 flex-row">
            <View className="flex-1 overflow-hidden">
                {render.isLoading ? (
                    <Centered>
                        <ActivityIndicator />
                    </Centered>
                ) : render.error ? (
                    <Centered>
                        <Text className="text-sm text-muted-foreground">
                            Could not open document: {render.error.message}
                        </Text>
                    </Centered>
                ) : !render.data?.html || config.isEmpty(render.data.html) ? (
                    <Centered>
                        <Text className="text-sm text-muted-foreground">Nothing to display.</Text>
                    </Centered>
                ) : (
                    <HtmlSurface
                        html={render.data.html}
                        css={config.css}
                        ariaLabel={`Preview of ${session.name}`}
                        commentMode={config.anchorKind}
                        onAnchor={setPendingAnchor}
                    />
                )}
            </View>

            {pendingAnchor ? (
                <View className="w-[320px] border-l border-border p-3 gap-2">
                    <Text className="text-sm font-semibold text-foreground">
                        Comment on{' '}
                        {pendingAnchor.kind === 'calc_cell'
                            ? `${pendingAnchor.col}${pendingAnchor.row}`
                            : `“${pendingAnchor.quoted.slice(0, 40)}”`}
                    </Text>
                    <CommentComposer
                        autoFocus
                        submitLabel="Comment"
                        isPending={comments.add.isPending}
                        error={comments.add.error ? 'Could not post comment' : null}
                        onCancel={() => setPendingAnchor(null)}
                        onSubmit={submitNewComment}
                    />
                </View>
            ) : null}

            <CommentDrawer<RailRow>
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                groups={groups}
                currentUserOrgId={session.anonId}
                onReply={(group, threadId, body) => {
                    const root = group.threads[0].root
                    if (!root.anchor) return
                    comments.add.mutate({
                        anchorKind: root.anchor_kind,
                        anchor: root.anchor,
                        parentComment: threadId,
                        body,
                    })
                }}
                isReplyPending={comments.add.isPending}
                onEdit={(commentId, body) => comments.editBody(commentId, body)}
                onDelete={commentId => comments.remove(commentId)}
                onResolve={threadId => comments.resolve(threadId)}
                onReopen={threadId => comments.reopen(threadId)}
            />
        </View>
    )
}

function Centered({ children }: { children: React.ReactNode }) {
    return <View className="flex-1 items-center justify-center px-4">{children}</View>
}
