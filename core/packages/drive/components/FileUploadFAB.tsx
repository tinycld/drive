import { Upload } from 'lucide-react-native'
import { FAB } from '~/components/FAB'
import { useDrive } from '../hooks/useDrive'

interface FileUploadFABProps {
    isVisible: boolean
}

export function FileUploadFAB({ isVisible }: FileUploadFABProps) {
    const { triggerFilePicker } = useDrive()

    return (
        <FAB
            icon={Upload}
            onPress={triggerFilePicker}
            accessibilityLabel="Upload files"
            isVisible={isVisible}
        />
    )
}
