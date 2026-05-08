import { isLocalhostRuntime, setWindowValue } from '../platform/web-adapter.js';

const isLocal = isLocalhostRuntime();

export const PROD_BACKEND_URL = "https://asia-northeast3-plin-db93d.cloudfunctions.net/api";

const useLocalProxy = isLocal;
export const BACKEND_URL = useLocalProxy ? "/api" : PROD_BACKEND_URL;

let cachedServerConfig = null;

async function tryLoadConfig(baseUrl) {
    const endpoint = `${baseUrl}/config`;
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`${endpoint} 응답 오류 (${response.status})`);
    }

    const text = await response.text();
    if (!text) {
        throw new Error(`${endpoint} 응답이 비어 있습니다.`);
    }

    let config;
    try {
        config = JSON.parse(text);
    } catch (error) {
        throw new Error(`${endpoint} JSON 파싱 실패: ${error.message}`);
    }

    if (!config || (!config.firebaseApiKey && !config.googleMapsApiKey)) {
        throw new Error(`${endpoint}에 필요한 키가 없습니다.`);
    }

    return { baseUrl, config };
}

export async function fetchServerConfig() {
    if (cachedServerConfig) return cachedServerConfig;

    const errors = [];
    const candidates = [BACKEND_URL];
    if (useLocalProxy) candidates.push(PROD_BACKEND_URL);

    for (const baseUrl of candidates) {
        try {
            const loaded = await tryLoadConfig(baseUrl);
            cachedServerConfig = loaded.config;
            setWindowValue('BACKEND_URL', loaded.baseUrl);
            return cachedServerConfig;
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error(`서버 설정 로드 실패: ${errors.join(' | ')}`);
}

setWindowValue('BACKEND_URL', BACKEND_URL);
