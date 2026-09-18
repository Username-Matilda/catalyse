import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'

// vi.mock is hoisted and inert in the node environment — `next/navigation` is only ever
// imported by components, which only run under happy-dom.
vi.mock('next/navigation', () => import('./next-navigation'))

// Only `.test.tsx` files get happy-dom (see vitest.config.mts); everything below needs a window.
if (typeof window !== 'undefined') {
  const { installRpcFetch } = await import('./rpc-fetch')
  const { cleanup, configure } = await import('@testing-library/react')
  const { queryClient } = await import('@/lib/query-client')
  const { navigation } = await import('./next-navigation')
  installRpcFetch()
  // `findBy*` waits for a real RPC round trip; Testing Library's default of one second is
  // far too tight on a busy CI runner, where a page's first load can take several seconds.
  configure({ asyncUtilTimeout: 15_000 })
  // The app's client retries failed queries with backoff; a test asserting on an error state
  // would otherwise wait several seconds for the retries to run out.
  queryClient.setDefaultOptions({ queries: { retry: false } })
  // happy-dom has no layout, so it does not implement scrollIntoView.
  Element.prototype.scrollIntoView = () => {}
  // Nor does it have the blocking dialogs; a test that expects one spies on it. Unspied, a
  // confirm is declined, so an unexpected destructive action does nothing.
  window.confirm = () => false
  // happy-dom leaves `display` unset on inline elements, and an accessible name then gets a
  // space where a browser would have none ("Pending Review 1" for a label with a badge).
  const inline = document.createElement('style')
  inline.textContent =
    'a,abbr,b,cite,code,data,dfn,em,i,img,kbd,label,mark,q,s,samp,small,span,strong,sub,sup,time,u,var,svg{display:inline}'
  document.head.appendChild(inline)
  // Its clipboard is a read-only accessor; tests assign a fake with `Object.assign`.
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    writable: true,
    configurable: true,
  })

  afterEach(() => {
    cleanup()
    queryClient.clear()
    localStorage.clear()
    navigation.reset()
  })
}
