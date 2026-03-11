'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type TransitionType = 'slide-left' | 'slide-right' | 'none'

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [transitionType, setTransitionType] = useState<TransitionType>('none')
  const [isAnimating, setIsAnimating] = useState(false)
  const prevPathRef = useRef(pathname)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      const prevPath = prevPathRef.current
      const currentPath = pathname

      if (prevPath === '/' && currentPath === '/chat') {
        setTransitionType('slide-left')
      } else if (prevPath === '/chat' && currentPath === '/') {
        setTransitionType('slide-right')
      } else {
        setTransitionType('none')
      }

      setIsAnimating(true)
      prevPathRef.current = pathname

      const timer = setTimeout(() => {
        setIsAnimating(false)
        setTransitionType('none')
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [pathname])

  const getTransitionClass = () => {
    if (!isAnimating) return 'translate-x-0 opacity-100'
    
    switch (transitionType) {
      case 'slide-left':
        return 'animate-slide-in-left'
      case 'slide-right':
        return 'animate-slide-in-right'
      default:
        return 'translate-x-0 opacity-100'
    }
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full transition-all duration-300 ease-out ${getTransitionClass()}`}
      style={{
        willChange: isAnimating ? 'transform, opacity' : 'auto'
      }}
    >
      {children}
    </div>
  )
}

export function usePageTransition() {
  const router = useRouter()
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)

  const navigateTo = (path: string) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    router.push(path)
    setTimeout(() => setIsTransitioning(false), 300)
  }

  return { navigateTo, isTransitioning }
}
