import { defineConfig } from 'vite';
import { resolve } from 'path';

const EMULATOR_API_TARGET = 'http://127.0.0.1:5001/plin-db93d/asia-northeast3/api';
const PROD_API_TARGET = 'https://asia-northeast3-plin-db93d.cloudfunctions.net/api';
const useFunctionsEmulator = process.env.VITE_USE_FUNCTIONS_EMULATOR === 'true';

export default defineConfig({
    root: 'public', // Root directory for Vite (source)
    base: '/', // [Fixed] Ensure absolute paths for assets
    publicDir: 'static', // Static assets directory relative to root
    build: {
        outDir: '../dist', // Output directory relative to root
        emptyOutDir: true, // Clean dist before build
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'public/index.html'),
                openview: resolve(__dirname, 'public/openview.html'),
                accountDelete: resolve(__dirname, 'public/account-delete.html'),
                authSocialComplete: resolve(__dirname, 'public/auth-social-complete.html'),
                blog: resolve(__dirname, 'public/blog.html'),
                company: resolve(__dirname, 'public/company.html'),
                appPlin: resolve(__dirname, 'public/apps/plin.html'),
                appDailyIng: resolve(__dirname, 'public/apps/daily-ing.html'),
                notices: resolve(__dirname, 'public/notices.html'),
                privacy: resolve(__dirname, 'public/privacy.html'),
                terms: resolve(__dirname, 'public/terms.html'),
                dailyIngPrivacy: resolve(__dirname, 'public/daily-ing/privacy.html'),
                dailyIngTerms: resolve(__dirname, 'public/daily-ing/terms.html'),
                dailyIngSupport: resolve(__dirname, 'public/daily-ing/support.html'),
                subscriptionTerms: resolve(__dirname, 'public/subscription-terms.html'),
                locationTerms: resolve(__dirname, 'public/location-terms.html'),
                operationPolicy: resolve(__dirname, 'public/operation-policy.html'),
                youthProtectionPolicy: resolve(__dirname, 'public/youth-protection-policy.html')
            },
            // [New] Code Splitting (Manual Chunks)
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        // Keep the rich text editor out of the initial app vendor chunk.
                        if (id.includes('node_modules/tinymce')) return 'tinymce';
                        // Firebase/Firestore separately
                        if (id.includes('firebase')) return 'firebase';
                        // Document processing libraries
                        if (id.includes('jspdf')) return 'pdf-lib';
                        if (id.includes('html2canvas')) return 'canvas-lib';
                        // General vendor chunk
                        return 'vendor';
                    }
                }
            }
        },
        target: 'esnext', // Modern browsers
    },
    server: {
        port: 5173,
        host: true, // 네트워크 인터페이스 허용
        strictPort: true,
        hmr: {
            protocol: 'ws',
            port: 5173,
            clientPort: 5173
        },
        open: true,
        headers: {
            // [Fix] Google Login COOP Error
            'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
            // 'Cross-Origin-Embedder-Policy': 'credentialless' // Removed to minimize conflicts
        },
        proxy: {
            // 기본은 배포 Functions 사용, 필요 시 VITE_USE_FUNCTIONS_EMULATOR=true로 에뮬레이터 전환
            '/api': {
                target: useFunctionsEmulator ? EMULATOR_API_TARGET : PROD_API_TARGET,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, '')
            }
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'public'),
        },
    },
});
