import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  /*
    Vite listens on 3100 but the browser reaches it as https://localhost:3000,
    through the Caddy proxy that gives dev HTTP/2 (see ../../Caddyfile). The
    HMR client has to be told where to dial back, or it tries ws://localhost
    :3100 from a TLS page and is blocked as mixed content.
  */
  server: {
    hmr: { protocol: 'wss', host: 'localhost', clientPort: 3000 },
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
