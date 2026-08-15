'use client'

import { Suspense } from 'react'
import Shop from '../../views/Shop'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Shop />
    </Suspense>
  )
}
