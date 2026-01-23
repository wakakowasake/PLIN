import { defineConfig } from 'vite';
import { resolve } from 'path';

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
                privacy: resolve(__dirname, 'public/privacy.html'),
                terms: resolve(__dirname, 'public/terms.html')
            },
        },
        target: 'esnext', // Modern browsers
    },
    server: {
        port: 5173,
        host: true, // 네트워크 인터페이스 허용
        hmr: {
            host: 'localhost',
        },
        open: true,
        headers: {
            // [Fix] Google Login COOP Error
            'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
            // 'Cross-Origin-Embedder-Policy': 'credentialless' // Removed to minimize conflicts
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'public'),
        },
    },
});
