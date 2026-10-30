'use client'

import { ReactNode, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface LayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: 'dashboard' },
  { name: 'Upload records', href: '/upload', icon: 'upload' },
  { name: 'Attendance', href: '/results', icon: 'calendar' },
  { name: 'Review issues', href: '/results#review', icon: 'alert' },
  { name: 'Reports', href: '/results#reports', icon: 'report' },
  { name: 'Settings', href: '/rules', icon: 'settings' },
]

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/></>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></>,
    report: <><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 3v5h5M9 13h6m-6 4h6"/></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.2 1-1.2 2.1-1.5-.5a8 8 0 0 1-1.7 1l-.3 1.6h-2.4l-.3-1.6a8 8 0 0 1-1.7-1l-1.5.5-1.2-2.1 1.2-1a8 8 0 0 1 0-2l-1.2-1 1.2-2.1 1.5.5a8 8 0 0 1 1.7-1l.3-1.6H15l.3 1.6a8 8 0 0 1 1.7 1l1.5-.5 1.2 2.1-1.2 1a8 8 0 0 1-.1 2Z" transform="translate(-1 -1)"/></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">{paths[name]}</svg>
}

export default function Layout({ children, title, subtitle }: LayoutProps) {
  const pathname = usePathname()
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [hash, setHash] = useState('')

  useEffect(() => {
    api.health().then(() => setBackendStatus('connected')).catch(() => setBackendStatus('disconnected'))
  }, [])

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [pathname])

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark"><NavIcon name="dashboard"/></span>
          <span className="brand-copy"><strong>MM&amp;RJD</strong><small>Attendance</small></span>
        </Link>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const itemPath = item.href.split('#')[0]
            const active = item.href.includes('#')
              ? pathname === itemPath && hash === item.href.slice(item.href.indexOf('#'))
              : pathname === itemPath && (pathname !== '/results' || !hash)
            return <Link key={item.name} href={item.href} aria-current={active ? 'page' : undefined} className={`nav-link${active ? ' active' : ''}`}><NavIcon name={item.icon}/><span>{item.name}</span></Link>
          })}
        </nav>
        <div className="sidebar-status" role="status"><span className={`status-dot ${backendStatus}`}/><span>{backendStatus === 'connected' ? 'System connected' : backendStatus === 'checking' ? 'Connecting…' : 'System offline'}</span></div>
      </aside>
      <main className="dashboard-main">
        {(title || subtitle) && <header className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></header>}
        <div className="page-content">{children}</div>
      </main>
    </div>
  )
}
