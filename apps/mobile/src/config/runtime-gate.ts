export type RuntimeGateInput = {
    isDev: boolean;
    firebaseReady: boolean;
    googleAuthReady: boolean;
    firebaseError?: string | null;
    googleError?: string | null;
};

export type RuntimeGateState = {
    isBlocked: boolean;
    title: string | null;
    description: string | null;
    supportText: string | null;
};

function normalizeMessage(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() : '';
}

export function resolveRuntimeGateState(input: RuntimeGateInput): RuntimeGateState {
    if (input.isDev || (input.firebaseReady && input.googleAuthReady)) {
        return {
            isBlocked: false,
            title: null,
            description: null,
            supportText: null
        };
    }

    const messages = Array.from(new Set([
        input.firebaseReady ? '' : normalizeMessage(input.firebaseError),
        input.googleAuthReady ? '' : normalizeMessage(input.googleError)
    ].filter(Boolean)));

    return {
        isBlocked: true,
        title: '앱 설정을 확인해 주세요.',
        description: messages.join('\n') || '앱 설정을 확인하지 못했어요. 관리자에게 문의해 주세요.',
        supportText: '운영 설정이 복구되면 앱을 다시 실행해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.'
    };
}
