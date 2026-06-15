// react-native-web accepts a `dataSet` prop on View/Pressable and renders each
// key as a `data-*` attribute, but @types/react-native doesn't model it. The
// drive grid tags its tiles with `dataSet={{ driveItemId }}` so the
// drag-to-select hit-test can find and measure them by `[data-drive-item-id]`
// (see hooks/useMarqueeSelection.ts). Augment ViewProps so that's typed rather
// than cast.
import 'react-native'

declare module 'react-native' {
    interface ViewProps {
        /** react-native-web only: each entry renders as a `data-<kebab-key>`
         *  DOM attribute. No-op on native. */
        dataSet?: Record<string, string | number | undefined>
    }
}
