import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { getLocale } from '#/paraglide/runtime'
import { m } from '#/paraglide/messages'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Tote — Say it, we bag it.' },
      { name: 'description', content: m.baseline() },
      { name: 'theme-color', content: '#3d7d54' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Tote' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { property: 'og:title', content: 'Tote' },
      { property: 'og:description', content: m.baseline() },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
})

/*
  The worker is production-only. Its asset handler is cache-first against a
  fixed cache name, which in dev pins Vite's module URLs forever: the browser
  keeps running last week's JS against a freshly SSR-ed tree (hydration
  mismatch) with a stale HMR token (dead websocket). So dev ships the opposite
  script and tears down whatever a previous run installed.
*/
const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
`

const SW_UNREGISTER = `
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .then(() => window.caches && caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))))
    .then(() => {
      // Only the reload swaps the already-running stale modules for fresh ones.
      // sessionStorage caps it at one attempt per tab, so a worker that somehow
      // survives unregistration can't turn this into a reload loop.
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('tote-sw-purged')) {
        sessionStorage.setItem('tote-sw-purged', '1')
        location.reload()
      }
    })
}
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <script dangerouslySetInnerHTML={{ __html: import.meta.env.PROD ? SW_REGISTER : SW_UNREGISTER }} />
        <Scripts />
      </body>
    </html>
  )
}
