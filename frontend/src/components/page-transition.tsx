'use client'

import { useEffect, useState, useRef, ReactNode, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [prevChildren, setPrevChildren] = useState<ReactNode | null>(null)
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'exit' | 'enter'>('idle')
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const prevPathRef = useRef(pathname)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (prevPathRef.current !== pathname) {
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

      setPrevChildren(displayChildren)
      setTransitionPhase('exit')

      const exitTimer = setTimeout(() => {
        setDisplayChildren(children)
        setTransitionPhase('enter')
        
        const enterTimer = setTimeout(() => {
          setTransitionPhase('idle')
          setPrevChildren(null)
        }, 300)

        return () => clearTimeout(enterTimer)
      }, 300)

      prevPathRef.current = pathname

      return () => clearTimeout(exitTimer)
    } else {
      setDisplayChildren(children)
    }
  }, [pathname, children])

  const getOldPageStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    }

    if (transitionPhase === 'idle' || transitionPhase === 'enter') {
      return {
        ...baseStyle,
        transform: direction === 'left' ? 'translateX(-100%)' : 'translateX(100%)',
      }
    }

    return baseStyle
  }

  const getNewPageStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    }

    if (transitionPhase === 'exit') {
      return {
        ...baseStyle,
        transform: direction === 'left' ? 'translateX(100%)' : 'translateX(-100%)',
      }
    }

    return {
      ...baseStyle,
      transform: 'translateX(0)',
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {prevChildren && (
        <div style={getOldPageStyle()}>
          {prevChildren}
        </div>
      )}
      <div style={getNewPageStyle()}>
        {displayChildren}
      </div>
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
    setTimeout(() => setIsTransitioning(false), 600)
  }, [isTransitioning, router])

  return { navigateTo, isTransitioning }
}
