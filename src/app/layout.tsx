import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Literata } from 'next/font/google';
import './globals.css';

// Primary outdoor display & UI label typography (weights 600 and 800)
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--font-bricolage',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

// Primary fieldwork reading typography (serif body, 17px)
const literata = Literata({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-literata',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'FieldEval — Outdoor Vision Model Evaluation',
  description: 'Camera-first fieldwork benchmark for open-weight vision models.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FieldEval',
  },
};

export const viewport: Viewport = {
  themeColor: '#E8EAEC',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${literata.variable}`}>
      <body className="min-h-screen bg-concrete text-tape-black flex flex-col items-center select-none font-serif antialiased">
        <ServiceWorkerRegistration />
        <div className="w-full max-w-[440px] min-h-screen flex flex-col relative px-3.5 sm:px-4 pb-safe">
          {children}
        </div>
      </body>
    </html>
  );
}
