import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import notifier from 'node-notifier'

function compileNotifierPlugin(): Plugin {
  const title = 'HR Agent React'
  let changeTimer: NodeJS.Timeout | undefined

  const notify = (message: string, type: 'info' | 'error' = 'info') => {
    notifier.notify({
      title,
      message,
      sound: false,
      wait: false,
      timeout: 3,
    })

    const log = type === 'error' ? console.error : console.log
    log(`[${title}] ${message}`)
  }

  return {
    name: 'compile-notifier',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        const port =
          typeof address === 'object' && address?.port ? address.port : server.config.server.port

        notify(`Dev server ready on port ${port ?? 5173}`)
      })

      server.watcher.on('all', (eventName, file) => {
        if (!['add', 'change', 'unlink'].includes(eventName)) {
          return
        }

        const relativeFile = path.relative(server.config.root, file)

        if (changeTimer) {
          clearTimeout(changeTimer)
        }

        // Vite does not expose webpack-style compile completion hooks in dev,
        // so use a short debounce to notify once after the file watcher settles.
        changeTimer = setTimeout(() => {
          notify(`Recompiled after ${relativeFile}`)
        }, 300)
      })
    },
    buildStart() {
      notify('Build started')
    },
    buildEnd(error) {
      if (error) {
        notify(`Build failed: ${error.message}`, 'error')
        return
      }

      notify('Build completed successfully')
    },
    closeBundle() {
      if (changeTimer) {
        clearTimeout(changeTimer)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used - do not remove them
    react(),
    tailwindcss(),
    compileNotifierPlugin(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
