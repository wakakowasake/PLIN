import { Platform } from 'react-native';

export function getNativeStoreLabel() {
    if (Platform.OS === 'ios') {
        return 'App Store';
    }

    if (Platform.OS === 'android') {
        return 'Google Play';
    }

    return '앱 스토어';
}
