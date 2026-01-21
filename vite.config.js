import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'public', // Root directory for Vite (source)
    publicDir: '../assets', // (Optional) If you have other static assets outside public
    build: {
        outDir: '../dist', // Output directory relative to root
        emptyOutDir: true, // Clean dist before build
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'public/index.html'),
                openview: resolve(__dirname, 'public/openview.html') // Multi-page app support
            },
        },
        target: 'esnext', // Modern browsers
    },
    server: {
        port: 5173,
        open: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'public'),
        },
    },
});
