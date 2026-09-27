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

const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
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
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
        <Scripts />
      </body>
    </html>
  )
}
