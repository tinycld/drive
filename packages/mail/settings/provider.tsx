import { Globe } from 'lucide-react-native'
import { newRecordId } from 'pbtsdb'
import { Button, ScrollView, SizableText, useTheme, YStack } from 'tamagui'
import { handleMutationErrorsWithForm } from '~/lib/errors'
import { useMutation } from '~/lib/mutations'
import { useStore } from '~/lib/pocketbase'
import { useOrgInfo } from '~/lib/use-org-info'
import { useSettings } from '~/lib/use-settings'
import { FormErrorSummary, SelectInput, TextInput, useForm, z, zodResolver } from '~/ui/form'

const PROVIDER_OPTIONS = [{ label: 'Postmark', value: 'postmark' }]

const mailSettingsSchema = z.object({
    provider: z.string().min(1, 'Provider is required'),
    postmark_server_token: z.string(),
    postmark_account_token: z.string(),
})

export default function ProviderSettings() {
    const theme = useTheme()
    const { orgId } = useOrgInfo()
    const settings = useSettings('mail', orgId)
    const [settingsCollection] = useStore('settings')

    const settingsMap = new Map(settings.map(s => [s.key, s]))

    const {
        control,
        handleSubmit,
        setError,
        getValues,
        formState: { errors, isSubmitted, isDirty },
    } = useForm({
        mode: 'onChange',
        resolver: zodResolver(mailSettingsSchema),
        values: {
            provider: (settingsMap.get('provider')?.value as string) ?? 'postmark',
            postmark_server_token:
                (settingsMap.get('postmark_server_token')?.value as string) ?? '',
            postmark_account_token:
                (settingsMap.get('postmark_account_token')?.value as string) ?? '',
        },
    })

    const saveMutation = useMutation({
        mutationFn: function* (data: z.infer<typeof mailSettingsSchema>) {
            const entries = [
                { key: 'provider', value: data.provider },
                { key: 'postmark_server_token', value: data.postmark_server_token },
                { key: 'postmark_account_token', value: data.postmark_account_token },
            ]
            for (const entry of entries) {
                const existing = settingsMap.get(entry.key)
                if (existing) {
                    yield settingsCollection.update(existing.id, draft => {
                        draft.value = entry.value
                    })
                } else {
                    yield settingsCollection.insert({
                        id: newRecordId(),
                        app: 'mail',
                        key: entry.key,
                        value: entry.value,
                        org: orgId,
                    })
                }
            }
        },
        onError: handleMutationErrorsWithForm({ setError, getValues }),
    })

    const onSubmit = handleSubmit(data => saveMutation.mutate(data))
    const canSubmit = !saveMutation.isPending && isDirty

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} backgroundColor="$background">
            <YStack flex={1} padding="$5" gap="$5" maxWidth={600}>
                <YStack gap="$2">
                    <Globe size={32} color={theme.colorFocus.val} />
                    <SizableText size="$6" fontWeight="bold" color="$color">
                        Mail Provider
                    </SizableText>
                    <SizableText size="$3" color="$color8">
                        Configure the email provider for your organization. Settings here override
                        server-level environment variables.
                    </SizableText>
                </YStack>

                <FormErrorSummary errors={errors} isEnabled={isSubmitted} />

                <YStack gap="$4">
                    <SelectInput
                        control={control}
                        name="provider"
                        label="Provider"
                        options={PROVIDER_OPTIONS}
                    />
                    <TextInput
                        control={control}
                        name="postmark_server_token"
                        label="Postmark Server Token"
                        secureTextEntry
                    />
                    <TextInput
                        control={control}
                        name="postmark_account_token"
                        label="Postmark Account Token"
                        secureTextEntry
                    />
                </YStack>

                <Button
                    theme="accent"
                    size="$4"
                    onPress={onSubmit}
                    disabled={!canSubmit}
                    opacity={canSubmit ? 1 : 0.5}
                >
                    <Button.Text fontWeight="600">
                        {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </Button.Text>
                </Button>
            </YStack>
        </ScrollView>
    )
}
