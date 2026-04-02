import { QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'one'
import { Platform, useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'
import config from '~/tamagui.config'
import { AuthProvider } from '~/lib/auth'
import { PBTSDBProvider, queryClient } from '~/lib/pocketbase'

export default function Layout() {
    const colorScheme = useColorScheme()
    const defaultTheme = colorScheme === 'dark' ? 'dark' : 'light'

    if (Platform.OS === 'web') {
        return (
            <html lang="en-US">
                <head>
                    <meta charSet="utf-8" />
                    <meta
                        httpEquiv="X-UA-Compatible"
                        content="IE=edge"
                    />
                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1, maximum-scale=5"
                    />
                    <link rel="icon" href="/favicon.svg" />
                </head>

                <TamaguiProvider config={config} defaultTheme={defaultTheme}>
                    <QueryClientProvider client={queryClient}>
                        <PBTSDBProvider>
                            <AuthProvider>
                                <Slot />
                            </AuthProvider>
                        </PBTSDBProvider>
                    </QueryClientProvider>
                </TamaguiProvider>
            </html>
        )
    }

    return (
        <TamaguiProvider config={config} defaultTheme={defaultTheme}>
            <QueryClientProvider client={queryClient}>
                <PBTSDBProvider>
                    <AuthProvider>
                        <Slot />
                    </AuthProvider>
                </PBTSDBProvider>
            </QueryClientProvider>
        </TamaguiProvider>
    )
}
