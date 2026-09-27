import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    /*
      Cookie first: the locale must be known on the SERVER (src/server.ts wraps
      the request in paraglideMiddleware) so SSR and hydration agree. The cookie
      is written by setLocale(); a first visit falls back to Accept-Language.
    */
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'tote-locale',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
