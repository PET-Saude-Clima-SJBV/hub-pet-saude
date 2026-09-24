import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // em desenvolvimento local, /api vai para o backend rodando na sua máquina
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
