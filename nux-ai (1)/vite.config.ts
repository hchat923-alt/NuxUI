import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
      proxy: {
        '/api/backend': {
          target: 'http://127.0.0.1:9655/v1',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/backend/, ''),
        },
        '/api/gemini-proxy': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/gemini-proxy/, ''),
        },
        '/api/deepseek-proxy': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/deepseek-proxy/, ''),
        },
      },
    },
  };
});
