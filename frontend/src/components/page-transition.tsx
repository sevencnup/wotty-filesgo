'use client'

import { useEffect, useState, useRef, ReactNode, useCallback, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface PageTransitionProps {
  children: ReactNode
}

const PAGE_TRANSITION_MS = 420
const PAGE_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [currentChildren, setCurrentChildren] = useState(children)
  const [transitionStage, setTransitionStage] = useState<'idle' | 'from' | 'to'>('idle')
  const prevPathRef = useRef(pathname)
  const isInitialMount = useRef(true)
  const rafIdRef = useRef<number | null>(null)
  const timerIdRef = useRef<number | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.prefetch('/chat')
      router.prefetch('/device')
    }, 0)
    return () => window.clearTimeout(id)
  }, [router])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      prevPathRef.current = pathname
      setCurrentChildren(children)
      return
    }

    if (prevPathRef.current === pathname) {
      setCurrentChildren(children)
      return
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }

    setCurrentChildren(children)
    setTransitionStage('from')

    rafIdRef.current = requestAnimationFrame(() => {
      setTransitionStage('to')
    })

    timerIdRef.current = window.setTimeout(() => {
      setTransitionStage('idle')
      rafIdRef.current = null
      timerIdRef.current = null
    }, PAGE_TRANSITION_MS)

    prevPathRef.current = pathname

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (timerIdRef.current !== null) {
        window.clearTimeout(timerIdRef.current)
        timerIdRef.current = null
      }
    }
  }, [pathname, children])

  const transition = `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}`

  const layerBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    transform: 'translate3d(0, 0, 0)',
  }

  const currentStyle: CSSProperties = (() => {
    if (transitionStage === 'from') {
      return {
        ...layerBase,
        zIndex: 20,
        transform: 'translate3d(100%, 0, 0)',
        transition: 'none',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.04), -24px 0 60px rgba(0,0,0,0.18)',
      }
    }

    if (transitionStage === 'to') {
      return {
        ...layerBase,
        zIndex: 20,
        transform: 'translate3d(0, 0, 0)',
        transition,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.04), -24px 0 60px rgba(0,0,0,0.18)',
      }
    }

    return {
      ...layerBase,
      zIndex: 20,
      transform: 'translate3d(0, 0, 0)',
      transition: 'none',
    }
  })()

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ contain: 'layout paint' }}>
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[#f8fafc]" />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-3xl opacity-60 mix-blend-multiply filter" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-200/50 rounded-full blur-3xl opacity-60 mix-blend-multiply filter" />
      </div>
      <div style={currentStyle}>{currentChildren}</div>
    </div>
  )
}

export function usePageTransition() {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = useState(false)

  const navigateTo = useCallback((path: string) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    router.push(path)
    setTimeout(() => setIsTransitioning(false), PAGE_TRANSITION_MS + 80)
  }, [isTransitioning, router])

  return { navigateTo, isTransitioning }
}
