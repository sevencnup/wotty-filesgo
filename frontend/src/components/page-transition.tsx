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
  const [currentChildren, setCurrentChildren] = useState(children)
  const [previousChildren, setPreviousChildren] = useState<ReactNode | null>(null)
  const [transitionStage, setTransitionStage] = useState<'idle' | 'from' | 'to'>('idle')
  const prevPathRef = useRef(pathname)
  const isInitialMount = useRef(true)
  const currentChildrenRef = useRef(children)
  const rafIdRef = useRef<number | null>(null)
  const timerIdRef = useRef<number | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const update = () => setPrefersReducedMotion(media.matches)
    update()

    if (media.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

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

    if (prefersReducedMotion) {
      prevPathRef.current = pathname
      setPreviousChildren(null)
      setTransitionStage('idle')
      setCurrentChildren(children)
      currentChildrenRef.current = children
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
  }, [pathname, children, prefersReducedMotion])

  const transition = `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}`
  const incomingX = '100%'
  const outgoingX = '-100%'

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
        transform: 'translate3d(0, 0, 0)',
        transition: 'none',
        pointerEvents: 'none',
      }
    }

    if (transitionStage === 'to') {
      return {
        ...layerBase,
        transform: `translate3d(${outgoingX}, 0, 0)`,
        transition,
        pointerEvents: 'none',
      }
    }

    return { display: 'none' }
  })()

  const currentStyle: CSSProperties = (() => {
    if (transitionStage === 'from' && previousChildren) {
      return {
        ...layerBase,
        transform: `translate3d(${incomingX}, 0, 0)`,
        transition: 'none',
      }
    }

    if (transitionStage === 'to' && previousChildren) {
      return {
        ...layerBase,
        transform: 'translate3d(0, 0, 0)',
        transition,
      }
    }

    return {
      ...layerBase,
      transform: 'translate3d(0, 0, 0)',
      transition: 'none',
    }
  })()

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ contain: 'layout paint' }}>
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
