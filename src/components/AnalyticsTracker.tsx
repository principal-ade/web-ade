'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { pageview } from '@/lib/analytics'

export default function AnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    
    // Try immediately, then retry with exponential backoff if gtag isn't ready
    let attempts = 0
    const maxAttempts = 5
    
    const tryPageview = () => {
      if (window.gtag) {
        pageview(url)
        return true
      }
      
      attempts++
      if (attempts < maxAttempts) {
        setTimeout(tryPageview, Math.min(100 * Math.pow(2, attempts), 1000))
      }
      return false
    }
    
    tryPageview()
  }, [pathname, searchParams])

  return null
}
