'use client'

import { useEffect, useState, useRef, ReactNode, useCallback, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface PageTransitionProps {
  children: ReactNode
}

const PAGE_TRANSITION_MS = 420
const PAGE_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const PAGE_TRANSITION_SHIFT_PX = 28

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const [currentChildren, setCurrentChildren] = useState(children)
  const [previousChildren, setPreviousChildren] = useState<ReactNode | null>(null)
  const [transitionStage, setTransitionStage] = useState<'idle' | 'from' | 'to'>('idle')
  const [direction, setDirection] = useState<'left' | 'right'>('left')
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

    const prevPath = prevPathRef.current
    const currentPath = pathname

    if (prevPath === '/' && (currentPath === '/chat' || currentPath === '/device')) {
      setDirection('left')
    } else if ((prevPath === '/chat' || prevPath === '/device') && currentPath === '/') {
      setDirection('right')
    } else if (prevPath === '/chat' && currentPath === '/device') {
      setDirection('left')
    } else if (prevPath === '/device' && currentPath === '/chat') {
      setDirection('right')
    } else {
      setDirection('left')
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

  const transition = `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}, opacity ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}`
  const incomingOffset = direction === 'left' ? PAGE_TRANSITION_SHIFT_PX : -PAGE_TRANSITION_SHIFT_PX
  const outgoingOffset = -incomingOffset

  const layerBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    willChange: 'transform, opacity',
    backfaceVisibility: 'hidden',
    transform: 'translate3d(0, 0, 0)',
  }

  const previousStyle: CSSProperties = (() => {
    if (!previousChildren) return { display: 'none' }

    if (transitionStage === 'from') {
      return {
        ...layerBase,
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
        transition: 'none',
        pointerEvents: 'none',
      }
    }

    if (transitionStage === 'to') {
      return {
        ...layerBase,
        opacity: 0,
        transform: `translate3d(${outgoingOffset}px, 0, 0) scale(0.98)`,
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
        opacity: 0,
        transform: `translate3d(${incomingOffset}px, 0, 0) scale(0.98)`,
        transition: 'none',
      }
    }

    if (transitionStage === 'to' && previousChildren) {
      return {
        ...layerBase,
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
        transition,
      }
    }

    return {
      ...layerBase,
      opacity: 1,
      transform: 'translate3d(0, 0, 0) scale(1)',
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
