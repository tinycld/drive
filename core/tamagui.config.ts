import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui } from 'tamagui'

const config = createTamagui({
    ...defaultConfig,
    settings: {
        ...defaultConfig.settings,
        onlyAllowShorthands: false,
    },
    themes: {
        ...defaultConfig.themes,
        light: {
            ...defaultConfig.themes.light,
            background: '#ffffff',
            backgroundHover: '#f8f9fa',
            color: '#1a1a1a',
            color8: '#666666',
            placeholderColor: '#9ca3af',
            borderColor: '#e0e0e0',
            accentBackground: '#007AFF',
            accentColor: '#ffffff',
            red8: '#dc2626',
            red2: '#fef2f2',
            red4: '#fecaca',
            railBackground: '#1a1a2e',
            railText: '#a0a0b8',
            railActiveText: '#ffffff',
            sidebarBackground: '#f3f4f6',
            activeIndicator: '#007AFF',
            hoverBackground: 'rgba(0, 0, 0, 0.05)',
            overlayBackground: 'rgba(0, 0, 0, 0.3)',
            modalOverlay: 'rgba(0, 0, 0, 0.4)',
        },
        dark: {
            ...defaultConfig.themes.dark,
            background: '#1a1a1a',
            backgroundHover: '#242424',
            color: '#e8e8e8',
            color8: '#999999',
            placeholderColor: '#6b7280',
            borderColor: '#333333',
            accentBackground: '#4da6ff',
            accentColor: '#ffffff',
            red8: '#f87171',
            red2: '#1a0a0a',
            red4: '#7f1d1d',
            railBackground: '#111118',
            railText: '#7a7a90',
            railActiveText: '#ffffff',
            sidebarBackground: '#1e1e1e',
            activeIndicator: '#4da6ff',
            hoverBackground: 'rgba(255, 255, 255, 0.06)',
            overlayBackground: 'rgba(0, 0, 0, 0.5)',
            modalOverlay: 'rgba(0, 0, 0, 0.6)',
        },
        light_accent: {
            ...defaultConfig.themes.light_accent,
            background: '#007AFF',
            backgroundHover: '#0066DD',
            backgroundPress: '#0055BB',
            color: '#ffffff',
        },
        dark_accent: {
            ...defaultConfig.themes.dark_accent,
            background: '#4da6ff',
            backgroundHover: '#3d96ef',
            backgroundPress: '#2d86df',
            color: '#ffffff',
        },
    },
})

export default config

type Conf = typeof config

declare module 'tamagui' {
    interface TamaguiCustomConfig extends Conf {}
}
