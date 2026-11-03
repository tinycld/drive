import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { newRecordId } from 'pbtsdb/core'
import { notifyWriteFailed } from '../lib/notify-write-failed'
import { useCanWriteItem } from './useCanWriteItem'

const APP = 'drive'
const KEY = 'auto_versions_default'

// The org default for automatic versions. `value` is a JSON field: the server
// (server/auto_versions_policy.go) treats only JSON true as on, so this writes
// a boolean.
export function useAutoVersionsDefault() {
    const [settingsCollection] = useStore('settings')
    // isLoading: until the row is known, a write could insert a second row
    // for the key (refused by the unique index).
    const { data: rows, isLoading } = useLiveQuery(query =>
        query
            .from({ setting: settingsCollection })
            .where(({ setting }) => and(eq(setting.app, APP), eq(setting.key, KEY)))
    )
    const row = rows?.[0]
    const save = useMutation({
        mutationFn: function* (on: boolean) {
            if (row) {
                yield settingsCollection.update(row.id, draft => {
                    draft.value = on
                })
            } else {
                yield settingsCollection.insert({
                    id: newRecordId(),
                    app: APP,
                    key: KEY,
                    value: on,
                })
            }
        },
        onError: err => notifyWriteFailed('drive.auto_versions_default', 'Setting not saved', err),
    })
    return { isOn: row?.value === true, isLoading, setOn: (on: boolean) => save.mutate(on) }
}

// A document's automatic-version state: its own choice ('on'/'off'), else the
// org default. A toggle always stores a choice, so the document keeps it when
// the org default changes later.
export function useAutoVersions(itemId: string) {
    const [driveItemsCollection] = useStore('drive_items')
    const { record: item } = useRecord(driveItemsCollection, itemId)
    const orgDefault = useAutoVersionsDefault()
    const canChange = useCanWriteItem(itemId, item?.created_by)
    const own = item?.auto_versions
    const isOn = own === 'on' || (own !== 'off' && orgDefault.isOn)
    const save = useMutation({
        mutationFn: function* (next: 'on' | 'off') {
            yield driveItemsCollection.update(itemId, draft => {
                draft.auto_versions = next
            })
        },
        onError: err => notifyWriteFailed('drive.auto_versions', 'Setting not saved', err),
    })
    return { isOn, canChange, toggle: () => save.mutate(isOn ? 'off' : 'on') }
}
