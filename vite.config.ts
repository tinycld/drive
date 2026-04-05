import { one } from 'one/vite'
import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        port: Number(process.env.VITE_PORT || 7100),
    },
    resolve: {
        alias: {
            'react-native-webview': '@10play/react-native-web-webview',
        },
    },
    plugins: [
        one({
            web: {
                defaultRenderMode: 'spa',
            },

            ...(process.env.TEST_METRO && {
                native: {
                    bundler: 'metro',
                },
            }),
        }),
    ],
})
