import { useContext } from 'react';

import { AdaptersContext } from './AdaptersProvider';

export function useAdapters() {
    const value = useContext(AdaptersContext);

    if (!value) {
        throw new Error('AdaptersProvider가 필요합니다.');
    }

    return value;
}
