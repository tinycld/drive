import { useWindowDimensions } from 'react-native'

export type Breakpoint = 'desktop' | 'tablet'

export function useBreakpoint(): Breakpoint {
    const { width } = useWindowDimensions()
    return width >= 1024 ? 'desktop' : 'tablet'
}
