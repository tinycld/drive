import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { SectionCard } from '@tinycld/core/components/settings/SectionCard'
import { Switch } from '@tinycld/core/ui/switch'
import { Text, View } from 'react-native'
import { useAutoVersionsDefault } from '../hooks/useAutoVersions'

const SWITCH_LABEL = 'Automatically version documents while editing'

export default function VersionsSettings() {
    const autoVersions = useAutoVersionsDefault()
    return (
        // The settings screen titles the panel and pads only its own header.
        <View className="gap-4 p-5">
            <SectionCard>
                <View className="flex-row items-center justify-between gap-4">
                    <View className="flex-1 flex-row items-center gap-2">
                        <Text className="text-base text-foreground">{SWITCH_LABEL}</Text>
                        <HelpIcon topic="drive:versions" />
                    </View>
                    <Switch
                        value={autoVersions.isOn}
                        onValueChange={autoVersions.setOn}
                        accessibilityLabel={SWITCH_LABEL}
                    />
                </View>
                <View className="mt-3 gap-2">
                    <HelpLine>
                        When this is on, Drive saves a version of a document after 10 minutes
                        without edits and when the last person closes it. Each version is a full
                        copy of the file and counts against the file owner's storage.
                    </HelpLine>
                    <HelpLine>
                        Automatic versions are thinned over time: all of them for 7 days, then one
                        per day up to 90 days, then one per week.
                    </HelpLine>
                    <HelpLine>
                        Each document can turn this on or off for itself from its File menu. File →
                        Save version, uploads and restores keep working whatever this setting is.
                    </HelpLine>
                </View>
            </SectionCard>
        </View>
    )
}

function HelpLine({ children }: { children: string }) {
    return <Text className="text-sm text-muted-foreground">{children}</Text>
}
