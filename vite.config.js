import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer headers are intentionally off. Hugging Face model
// files do not send Cross-Origin-Resource-Policy, so COEP would block Whisper.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
