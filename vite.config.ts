import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true, // Allow ngrok tunnel URLs
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/twilio': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/plivo': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/media': {
          target: 'http://localhost:3001',
          ws: true,
        },
        '/ui-sync': {
          target: 'http://localhost:3001',
          ws: true,
        },
      },
    },
    plugins: [react()],
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
