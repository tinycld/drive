import { useState } from 'react'
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { useTheme } from 'tamagui'
import { useAuth } from '~/lib/auth'
import { navigateToOrg } from '~/lib/org-url'

interface LoginModalProps {
    onSwitchToSignup: () => void
}

export function LoginModal({ onSwitchToSignup }: LoginModalProps) {
    const theme = useTheme()
    const { login } = useAuth({ throwIfAnon: false })
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setIsSubmitting(true)
        const result = await login(email.trim(), password)
        if (result.error) {
            setError(result.error)
            setIsSubmitting(false)
        } else if (result.user?.primaryOrgSlug && Platform.OS === 'web') {
            navigateToOrg(result.user.primaryOrgSlug)
        }
    }

    return (
        <View style={[styles.backdrop, { backgroundColor: theme.modalOverlay.val }]}>
            <View
                style={[
                    styles.modal,
                    { backgroundColor: theme.background.val, borderColor: theme.borderColor.val },
                ]}
            >
                <Text style={[styles.title, { color: theme.color.val }]}>Sign in</Text>
                <Text style={[styles.subtitle, { color: theme.color8.val }]}>
                    Sign in to your account to continue
                </Text>

                {error && (
                    <View style={[styles.errorContainer, { backgroundColor: theme.red2.val }]}>
                        <Text style={{ color: theme.red8.val, fontSize: 14 }}>{error}</Text>
                    </View>
                )}

                <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: theme.color.val }]}>Email</Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                color: theme.color.val,
                                borderColor: theme.borderColor.val,
                                backgroundColor: theme.backgroundHover.val,
                            },
                        ]}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={theme.color8.val}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        editable={!isSubmitting}
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: theme.color.val }]}>Password</Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                color: theme.color.val,
                                borderColor: theme.borderColor.val,
                                backgroundColor: theme.backgroundHover.val,
                            },
                        ]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        placeholderTextColor={theme.color8.val}
                        secureTextEntry
                        autoComplete="current-password"
                        editable={!isSubmitting}
                        onSubmitEditing={handleSubmit}
                    />
                </View>

                <Pressable
                    style={[
                        styles.submitButton,
                        { backgroundColor: theme.accentBackground.val },
                        !canSubmit && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={theme.accentColor.val} size="small" />
                    ) : (
                        <Text style={[styles.submitButtonText, { color: theme.accentColor.val }]}>
                            Sign in
                        </Text>
                    )}
                </Pressable>

                <Pressable style={styles.switchLink} onPress={onSwitchToSignup}>
                    <Text style={{ color: theme.color8.val, fontSize: 14 }}>
                        Don't have an account?{' '}
                        <Text style={{ color: theme.accentBackground.val, fontWeight: '600' }}>
                            Create one
                        </Text>
                    </Text>
                </Pressable>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200,
    },
    modal: {
        width: 400,
        maxWidth: '90%',
        borderRadius: 16,
        borderWidth: 1,
        padding: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 8,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        marginBottom: 24,
    },
    errorContainer: {
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    fieldGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    submitButton: {
        borderRadius: 8,
        padding: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    switchLink: {
        alignItems: 'center',
        marginTop: 16,
    },
})
