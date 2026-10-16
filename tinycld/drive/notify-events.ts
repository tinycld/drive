import type { PackageNotifyEvents } from '@tinycld/core/lib/notify/registry'

declare module '@tinycld/core/lib/notify/events' {
    interface NotificationEvents {
        'drive.save_succeeded': { name: string; folder: string }
        'drive.save_failed': { reason: string }
        'drive.template_saved': { name: string }
    }
}

/** Policy for drive's user-facing notifications; core composes these at boot. */
const notifyEvents = {
    'drive.save_succeeded': { channels: ['toast'], variant: 'success' },
    'drive.save_failed': { channels: ['toast'], variant: 'error' },
    'drive.template_saved': { channels: ['toast'], variant: 'success' },
} satisfies PackageNotifyEvents

export default notifyEvents
