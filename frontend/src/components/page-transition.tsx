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
  const [previousChildren, setPreviousChildren] = useState<ReactNode | null>(null)
  const [transitionStage, setTransitionStage] = useState<'idle' | 'from' | 'to'>('idle')
  const [transitionVariant, setTransitionVariant] = useState<'drawer-in' | 'drawer-out' | 'push'>('push')
  const prevPathRef = useRef(pathname)
  const isInitialMount = useRef(true)
  const currentChildrenRef = useRef(children)
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
      currentChildrenRef.current = children
      return
    }

    if (prevPathRef.current === pathname) {
      setCurrentChildren(children)
      currentChildrenRef.current = children
      return
    }

    const prevPath = prevPathRef.current
    const nextPath = pathname
    const isPickupChatPair =
      (prevPath === '/' && nextPath === '/chat') || (prevPath === '/chat' && nextPath === '/')

    if (isPickupChatPair) {
      setTransitionVariant(prevPath === '/' ? 'drawer-in' : 'drawer-out')
    } else {
      setTransitionVariant('push')
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }

    setPreviousChildren(currentChildrenRef.current)
    setCurrentChildren(children)
    currentChildrenRef.current = children
    setTransitionStage('from')

    rafIdRef.current = requestAnimationFrame(() => {
      setTransitionStage('to')
    })

    timerIdRef.current = window.setTimeout(() => {
      setTransitionStage('idle')
      setPreviousChildren(null)
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

  const previousStyle: CSSProperties = (() => {
    if (!previousChildren) return { display: 'none' }

    if (transitionStage === 'from') {
      return {
        ...layerBase,
        zIndex: transitionVariant === 'drawer-out' ? 20 : 10,
        transform: 'translate3d(0, 0, 0)',
        transition: 'none',
        pointerEvents: 'none',
      }
    }

    if (transitionStage === 'to') {
      if (transitionVariant === 'drawer-in') {
        return {
          ...layerBase,
          zIndex: 10,
          transform: 'translate3d(0, 0, 0)',
          transition: 'none',
          pointerEvents: 'none',
        }
      }

      return {
        ...layerBase,
        zIndex: transitionVariant === 'drawer-out' ? 20 : 10,
        transform: `translate3d(${transitionVariant === 'drawer-out' ? '100%' : '-100%'}, 0, 0)`,
        transition,
        pointerEvents: 'none',
      }
    }

    return { display: 'none' }
  })()

  const currentStyle: CSSProperties = (() => {
    if (transitionStage === 'from' && previousChildren) {
      if (transitionVariant === 'drawer-out') {
        return {
          ...layerBase,
          zIndex: 10,
          transform: 'translate3d(0, 0, 0)',
          transition: 'none',
        }
      }

      return {
        ...layerBase,
        zIndex: transitionVariant === 'drawer-in' ? 20 : 10,
        transform: 'translate3d(100%, 0, 0)',
        transition: 'none',
        boxShadow: transitionVariant === 'drawer-in' ? '0 0 0 1px rgba(0,0,0,0.04), -24px 0 60px rgba(0,0,0,0.18)' : undefined,
      }
    }

    if (transitionStage === 'to' && previousChildren) {
      if (transitionVariant === 'drawer-out') {
        return {
          ...layerBase,
          zIndex: 10,
          transform: 'translate3d(0, 0, 0)',
          transition: 'none',
        }
      }

      return {
        ...layerBase,
        zIndex: transitionVariant === 'drawer-in' ? 20 : 10,
        transform: 'translate3d(0, 0, 0)',
        transition: transitionVariant === 'drawer-out' ? 'none' : transition,
        boxShadow: transitionVariant === 'drawer-in' ? '0 0 0 1px rgba(0,0,0,0.04), -24px 0 60px rgba(0,0,0,0.18)' : undefined,
      }
    }

    return {
      ...layerBase,
      zIndex: 10,
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
      {previousChildren && <div style={previousStyle}>{previousChildren}</div>}
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
