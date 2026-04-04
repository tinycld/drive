import { Square, Star } from 'lucide-react-native'
import type { OneRouter } from 'one'
import { Link } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import type { MockEmail } from './mockData'

interface EmailRowProps {
    email: MockEmail
}

export function EmailRow({ email }: EmailRowProps) {
    const theme = useTheme()

    const rowBg = email.isRead ? 'transparent' : theme.backgroundHover.val
    const senderWeight = email.isRead ? '400' : '700'
    const subjectWeight = email.isRead ? '400' : '600'

    return (
        <Link href={`/app/mail/${email.id}` as OneRouter.Href}>
            <View
                style={[
                    styles.row,
                    {
                        backgroundColor: rowBg,
                        borderBottomColor: theme.borderColor.val,
                    },
                ]}
            >
                <Pressable style={styles.checkbox} onPress={e => e.stopPropagation()}>
                    <Square size={16} color={theme.color8.val} />
                </Pressable>
                <Pressable style={styles.starButton} onPress={e => e.stopPropagation()}>
                    <Star
                        size={16}
                        color={email.isStarred ? theme.yellow8.val : theme.color8.val}
                        fill={email.isStarred ? theme.yellow8.val : 'transparent'}
                    />
                </Pressable>
                <Text
                    style={[
                        styles.sender,
                        { color: theme.color.val, fontWeight: senderWeight as '400' | '700' },
                    ]}
                    numberOfLines={1}
                >
                    {email.sender}
                </Text>
                {email.threadCount && email.threadCount > 1 ? (
                    <Text style={[styles.threadBadge, { color: theme.color8.val }]}>
                        {email.threadCount}
                    </Text>
                ) : null}
                <View style={styles.subjectArea}>
                    <Text
                        style={[
                            styles.subject,
                            { color: theme.color.val, fontWeight: subjectWeight as '400' | '600' },
                        ]}
                        numberOfLines={1}
                    >
                        {email.subject}
                    </Text>
                    <Text style={[styles.preview, { color: theme.color8.val }]} numberOfLines={1}>
                        {' \u2014 '}
                        {email.preview}
                    </Text>
                </View>
                <Text style={[styles.date, { color: theme.color8.val }]}>{email.date}</Text>
            </View>
        </Link>
    )
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        gap: 4,
    },
    checkbox: {
        padding: 4,
    },
    starButton: {
        padding: 4,
    },
    sender: {
        fontSize: 13,
        width: 140,
        flexShrink: 0,
    },
    threadBadge: {
        fontSize: 11,
        flexShrink: 0,
    },
    subjectArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
    },
    subject: {
        fontSize: 13,
        flexShrink: 0,
    },
    preview: {
        fontSize: 13,
        flex: 1,
    },
    date: {
        fontSize: 12,
        flexShrink: 0,
        marginLeft: 8,
    },
})
