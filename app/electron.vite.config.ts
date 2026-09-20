import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { APP_NAME } from './src/shared/app-info'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAlias
      }
    },
    plugins: [
      react(),
      {
        // Lets index.html use %APP_NAME% so the name isn't hardcoded there.
        name: 'html-app-name',
        transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME)
      }
    ]
  }
})
