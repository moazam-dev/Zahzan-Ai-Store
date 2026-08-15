'use client'

import { Suspense } from 'react'
import Account from '../../views/Account'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  )
}
