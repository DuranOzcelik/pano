import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Geliştirmede /api istekleri .NET API'ye (5080) gider. Derleme çıktısı API'nin wwwroot'una yazılır,
// böylece ofiste tek servis hem API'yi hem arayüzü sunar.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5080' } },
  build: { outDir: '../backend/Pano.Api/wwwroot', emptyOutDir: true },
})
