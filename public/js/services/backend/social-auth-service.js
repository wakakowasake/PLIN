import { fetchBackendJson } from './api-client.js';

const CUSTOM_WEB_AUTH_PROVIDERS = new Set(['kakao', 'naver']);
const SOCIAL_AUTH_POPUP_MESSAGE_TYPE = 'plin-social-auth-complete';
const SOCIAL_AUTH_POPUP_CHANNEL_NAME = 'plin-social-auth-popup';
const SOCIAL_AUTH_POPUP_STORAGE_KEY = 'plin-social-auth-popup-result';

function normalizeProvider(provider) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    return CUSTOM_WEB_AUTH_PROVIDERS.has(normalized) ? normalized : null;
}

export function getSocialAuthCallbackUrl(options = {}) {
    const url = new URL('/auth-social-complete.html', window.location.origin);
    if (options.popup === true) {
        url.searchParams.set('popup', '1');
    }
    return url.toString();
}

export function getSocialAuthProviderLabel(provider) {
    switch (normalizeProvider(provider)) {
        case 'kakao':
            return '카카오';
        case 'naver':
            return '네이버';
        default:
            return '소셜';
    }
}

function getSocialPopupFeatures(width = 460, height = 760) {
    const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
    const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = Math.max(0, Math.round(dualScreenLeft + ((viewportWidth - width) / 2)));
    const top = Math.max(0, Math.round(dualScreenTop + ((viewportHeight - height) / 2)));

    return [
        'popup',
        'resizable=yes',
        'scrollbars=yes',
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`
    ].join(',');
}

function buildSocialPopupShellMarkup(providerLabel) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${providerLabel} 로그인 준비 중...</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Pretendard, Inter, "Noto Sans KR", system-ui, sans-serif;
      background: #ffffff;
      color: #1a1c20;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(255, 102, 0, 0.18), transparent 36%),
        linear-gradient(180deg, #ffffff, #f3f4f5);
    }
    .card {
      width: min(360px, calc(100vw - 32px));
      border-radius: 28px;
      border: 1px solid rgba(220, 222, 227, 0.95);
      background: rgba(255, 255, 255, 0.97);
      box-shadow: 0 24px 40px rgba(26, 28, 32, 0.12);
      padding: 28px 24px;
      text-align: center;
    }
    .badge {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      background: rgba(255, 102, 0, 0.1);
      color: #ff6600;
      font-weight: 800;
      font-size: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
    }
    p {
      margin: 0;
      color: #868b94;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">P</div>
    <h1>${providerLabel} 로그인 창을 여는 중이에요</h1>
    <p>잠시만 기다리면 PLIN 로그인 화면이 이어집니다.</p>
  </div>
</body>
</html>`;
}

export function openWebSocialAuthPopupShell(provider) {
    const normalizedProvider = normalizeProvider(provider) || 'social';
    const providerLabel = getSocialAuthProviderLabel(provider);
    const popup = window.open('', `plin-social-auth-${normalizedProvider}`, getSocialPopupFeatures());

    if (!popup) {
        return null;
    }

    try {
        popup.document.open();
        popup.document.write(buildSocialPopupShellMarkup(providerLabel));
        popup.document.close();
    } catch {
        // Ignore document access failures; navigation will still proceed.
    }

    return popup;
}

export function waitForWebSocialAuthPopupResult(popup, provider, options = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const providerLabel = getSocialAuthProviderLabel(provider);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5 * 60 * 1000;

    if (!popup || !normalizedProvider) {
        return Promise.reject(new Error('로그인 창을 열지 못했어요.'));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const channel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel(SOCIAL_AUTH_POPUP_CHANNEL_NAME)
            : null;

        const closePopupWindow = () => {
            try {
                popup.close();
            } catch {
                // noop
            }
        };

        const readPopupPayload = (value) => {
            if (!value) {
                return null;
            }

            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return null;
                }
            }

            return typeof value === 'object' ? value : null;
        };

        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorage);
            if (closeWatcher) window.clearInterval(closeWatcher);
            if (timeoutHandle) window.clearTimeout(timeoutHandle);
            if (channel) channel.close();
        };

        const finish = (callback) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            callback();
        };

        const handleMessage = (event) => {
            if (event.origin !== window.location.origin) {
                return;
            }

            const payload = readPopupPayload(event.data);
            if (!payload || payload.type !== SOCIAL_AUTH_POPUP_MESSAGE_TYPE) {
                return;
            }

            if (normalizeProvider(payload.provider) !== normalizedProvider) {
                return;
            }

            finish(() => {
                try {
                    localStorage.removeItem(SOCIAL_AUTH_POPUP_STORAGE_KEY);
                } catch {
                    // noop
                }
                closePopupWindow();
                resolve({
                    provider: payload.provider,
                    ticket: payload.ticket || '',
                    error: payload.error || ''
                });
            });
        };

        const handleStorage = (event) => {
            if (event.key !== SOCIAL_AUTH_POPUP_STORAGE_KEY) {
                return;
            }

            const payload = readPopupPayload(event.newValue);
            if (!payload || payload.type !== SOCIAL_AUTH_POPUP_MESSAGE_TYPE) {
                return;
            }

            if (normalizeProvider(payload.provider) !== normalizedProvider) {
                return;
            }

            finish(() => {
                try {
                    localStorage.removeItem(SOCIAL_AUTH_POPUP_STORAGE_KEY);
                } catch {
                    // noop
                }
                closePopupWindow();
                resolve({
                    provider: payload.provider,
                    ticket: payload.ticket || '',
                    error: payload.error || ''
                });
            });
        };

        const handleChannelMessage = (event) => {
            const payload = readPopupPayload(event.data);
            if (!payload || payload.type !== SOCIAL_AUTH_POPUP_MESSAGE_TYPE) {
                return;
            }

            if (normalizeProvider(payload.provider) !== normalizedProvider) {
                return;
            }

            finish(() => {
                try {
                    localStorage.removeItem(SOCIAL_AUTH_POPUP_STORAGE_KEY);
                } catch {
                    // noop
                }
                closePopupWindow();
                resolve({
                    provider: payload.provider,
                    ticket: payload.ticket || '',
                    error: payload.error || ''
                });
            });
        };

        // Some browsers can sever the popup handle for cross-origin auth pages,
        // which makes `popup.closed` unreliable while the auth flow is still active.
        const closeWatcher = window.setInterval(() => {
            if (!popup.closed) {
                return;
            }

            try {
                const storedPayload = localStorage.getItem(SOCIAL_AUTH_POPUP_STORAGE_KEY);
                if (storedPayload) {
                    handleStorage({
                        key: SOCIAL_AUTH_POPUP_STORAGE_KEY,
                        newValue: storedPayload
                    });
                }
            } catch {
                // noop
            }
        }, 400);

        const timeoutHandle = window.setTimeout(() => {
            try {
                popup.close();
            } catch {
                // noop
            }

            finish(() => reject(new Error(`${providerLabel} 로그인이 예상보다 오래 걸리고 있어요. 다시 시도해 주세요.`)));
        }, timeoutMs);

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorage);
        if (channel) {
            channel.addEventListener('message', handleChannelMessage);
        }

        try {
            popup.focus();
        } catch {
            // noop
        }

        try {
            const storedPayload = localStorage.getItem(SOCIAL_AUTH_POPUP_STORAGE_KEY);
            if (storedPayload) {
                handleStorage({
                    key: SOCIAL_AUTH_POPUP_STORAGE_KEY,
                    newValue: storedPayload
                });
            }
        } catch {
            // noop
        }
    });
}

export async function startWebSocialAuthSession(provider, intent = 'signin', options = {}) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) {
        throw new Error('지원하지 않는 로그인 방식입니다.');
    }

    return fetchBackendJson('/auth/social/mobile-start', {
        method: 'POST',
        body: {
            provider: normalizedProvider,
            intent,
            appRedirectUrl: options.appRedirectUrl || getSocialAuthCallbackUrl({
                popup: options.flow === 'popup'
            })
        },
        requireAuth: intent === 'link'
    });
}

export async function exchangeWebSocialAuthSession({
    provider,
    intent = 'signin',
    ticket
}) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) {
        throw new Error('지원하지 않는 로그인 방식입니다.');
    }

    if (!ticket) {
        throw new Error('로그인 결과 티켓이 없습니다.');
    }

    return fetchBackendJson('/auth/social/mobile-exchange', {
        method: 'POST',
        body: {
            provider: normalizedProvider,
            intent,
            ticket
        },
        requireAuth: intent === 'link'
    });
}
