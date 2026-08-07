import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      name: 'notifyServer',
      formats: ['es', 'cjs'],
      fileName: (format) => `draw-starts-notify-serve.${format}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: ['ws', 'crypto', 'http', 'fs', 'path', 'url', 'buffer', 'stream', 'net', 'tls', 'zlib', 'events'],
      output: {
        exports: 'named',
      },
    },
  },
  plugins: [],
})
