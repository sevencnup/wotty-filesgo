'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface PageTransitionProps {
  children: ReactNode
}

type TransitionState = 'entering' | 'entered' | 'exiting' | 'exited'

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [transitionState, setTransitionState] = useState<TransitionState>('entered')
  const prevPathRef = useRef(pathname)
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  useEffect(() => {
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

      setTransitionState('exiting')
      
      const exitTimer = setTimeout(() => {
        setDisplayChildren(children)
        setTransitionState('entering')
        
        requestAnimationFrame(() => {
          setTransitionState('entered')
        })
      }, 150)

      prevPathRef.current = pathname

      return () => clearTimeout(exitTimer)
    } else {
      setDisplayChildren(children)
    }
  }, [pathname, children])

  const getTransitionClasses = () => {
    const baseClasses = 'transition-all duration-150 ease-out'
    
    switch (transitionState) {
      case 'exiting':
        return direction === 'left' 
          ? `${baseClasses} -translate-x-8 opacity-0`
          : `${baseClasses} translate-x-8 opacity-0`
      case 'entering':
        return direction === 'left'
          ? `${baseClasses} translate-x-8 opacity-0`
          : `${baseClasses} -translate-x-8 opacity-0`
      case 'entered':
        return `${baseClasses} translate-x-0 opacity-100`
      default:
        return `${baseClasses} translate-x-0 opacity-100`
    }
  }

  return (
    <div className="w-full h-full overflow-hidden">
      <div className={getTransitionClasses()}>
        {displayChildren}
      </div>
    </div>
  )
}
