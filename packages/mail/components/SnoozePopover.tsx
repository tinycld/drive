import { Clock } from 'lucide-react-native'
import { MenuActionItem, ToolbarMenu } from './DropdownMenu'

function laterToday(): string {
    const d = new Date()
    d.setHours(d.getHours() + 3, 0, 0, 0)
    return d.toISOString()
}

function tomorrowMorning(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(8, 0, 0, 0)
    return d.toISOString()
}

function nextWeek(): string {
    const d = new Date()
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7))
    d.setHours(8, 0, 0, 0)
    return d.toISOString()
}

interface SnoozePopoverProps {
    onSnooze: (date: string) => void
}

export function SnoozePopover({ onSnooze }: SnoozePopoverProps) {
    return (
        <ToolbarMenu icon={Clock} label="Snooze">
            <MenuActionItem label="Later today" onPress={() => onSnooze(laterToday())} />
            <MenuActionItem label="Tomorrow" onPress={() => onSnooze(tomorrowMorning())} />
            <MenuActionItem label="Next week" onPress={() => onSnooze(nextWeek())} />
        </ToolbarMenu>
    )
}
