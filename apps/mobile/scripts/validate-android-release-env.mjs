import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const minPlayVersionCode = 5;

if (
    process.env.EAS_BUILD === 'true'
    && (process.env.EAS_BUILD_PLATFORM !== 'android' || process.env.EAS_BUILD_PROFILE !== 'production')
) {
    console.log('[release-env] Skipping Android production release check for this EAS build.');
    process.exit(0);
}

const requiredPublicEnv = [
    'EXPO_PUBLIC_PLIN_FIREBASE_API_KEY',
    'EXPO_PUBLIC_PLIN_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_PLIN_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_PLIN_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_PLIN_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_PLIN_FIREBASE_APP_ID',
    'EXPO_PUBLIC_PLIN_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_PLIN_GOOGLE_ANDROID_CLIENT_ID'
];

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) {
            continue;
        }

        const [, key, rawValue] = match;
        let value = rawValue.trim();
        const quote = value[0];
        if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
            value = value.slice(1, -1);
            if (quote === '"') {
                value = value
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            }
        }

        values[key] = value;
    }

    return values;
}

function loadEnv() {
    const env = {};
    for (const filename of ['.env', '.env.local', '.env.production', '.env.production.local']) {
        Object.assign(env, parseEnvFile(path.join(projectDir, filename)));
    }

    return env;
}

function normalizeEnvValue(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value.trim();
    if (!normalized) {
        return '';
    }

    const lowercase = normalized.toLowerCase();
    if (
        lowercase.startsWith('your-')
        || lowercase.startsWith('replace-')
        || lowercase.startsWith('example')
        || lowercase === 'changeme'
        || normalized.includes('<')
        || normalized.includes('>')
    ) {
        return '';
    }

    return normalized;
}

function fail(title, lines) {
    console.error(`\n${title}`);
    for (const line of lines) {
        console.error(`- ${line}`);
    }
    console.error('\n앱이 Play에서 로드 실패로 막히지 않도록 설정을 채운 뒤 새 AAB를 다시 빌드해 주세요.');
    process.exit(1);
}

const fileEnv = loadEnv();
const missingEnv = requiredPublicEnv.filter((key) => !normalizeEnvValue(process.env[key] ?? fileEnv[key]));

if (missingEnv.length > 0) {
    fail('Android 릴리즈 공개 환경 변수가 비어 있거나 placeholder입니다.', missingEnv);
}

const appJsonPath = path.join(projectDir, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = appJson.expo ?? {};
const android = expo.android ?? {};
const configProblems = [];
const buildGradlePath = path.join(projectDir, 'android', 'app', 'build.gradle');
const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
const nativeVersionCode = Number(buildGradle.match(/\bversionCode\s+(\d+)/)?.[1]);

if (expo.name !== 'PLIN') {
    configProblems.push(`expo.name이 PLIN이어야 합니다. 현재: ${expo.name ?? '(없음)'}`);
}

if (expo.owner !== 'plin.ink') {
    configProblems.push(`expo.owner가 plin.ink이어야 합니다. 현재: ${expo.owner ?? '(없음)'}`);
}

if (android.package !== 'ink.plin.mobile') {
    configProblems.push(`android.package가 ink.plin.mobile이어야 합니다. 현재: ${android.package ?? '(없음)'}`);
}

if (!android.googleServicesFile) {
    configProblems.push('android.googleServicesFile이 없습니다.');
} else {
    const googleServicesPath = path.resolve(projectDir, android.googleServicesFile);
    if (!fs.existsSync(googleServicesPath)) {
        configProblems.push(`android.googleServicesFile 파일을 찾을 수 없습니다: ${android.googleServicesFile}`);
    }
}

if (!normalizeEnvValue(expo.extra?.eas?.projectId)) {
    configProblems.push('extra.eas.projectId가 없습니다.');
}

if (!Number.isInteger(nativeVersionCode) || nativeVersionCode < minPlayVersionCode) {
    configProblems.push(`android/app/build.gradle versionCode는 ${minPlayVersionCode} 이상이어야 합니다. 현재: ${Number.isNaN(nativeVersionCode) ? '(없음)' : nativeVersionCode}`);
}

if (configProblems.length > 0) {
    fail('Android 릴리즈 앱 설정이 현재 운영 기준과 맞지 않습니다.', configProblems);
}

console.log('[release-env] Android release config OK');
for (const key of requiredPublicEnv) {
    const value = normalizeEnvValue(process.env[key] ?? fileEnv[key]);
    console.log(`[release-env] ${key}: set (${value.length} chars)`);
}
