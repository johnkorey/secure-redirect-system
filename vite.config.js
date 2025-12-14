import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Listen on all interfaces for external access
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/r': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Forward the real client IP
            const clientIp = req.headers['x-forwarded-for'] || 
                           req.headers['x-real-ip'] || 
                           req.socket.remoteAddress;
            if (clientIp) {
              proxyReq.setHeader('X-Forwarded-For', clientIp);
              proxyReq.setHeader('X-Real-IP', clientIp.split(',')[0].trim());
            }
          });
        }
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const clientIp = req.headers['x-forwarded-for'] || 
                           req.headers['x-real-ip'] || 
                           req.socket.remoteAddress;
            if (clientIp) {
              proxyReq.setHeader('X-Forwarded-For', clientIp);
              proxyReq.setHeader('X-Real-IP', clientIp.split(',')[0].trim());
            }
          });
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
}) 