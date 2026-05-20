import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import './globals.css'
import { PageTransition } from '@/components/page-transition'

const manrope = Manrope({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FilesGO - 简单的文件传输',
  description: '安全 · 高效的文件传输服务',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={`${manrope.className} h-screen overflow-hidden`}>
        <PageTransition>
          {children}
        </PageTransition>
      </body>
    </html>
  )
}
