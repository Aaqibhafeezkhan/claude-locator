import { memo, type ReactNode } from 'react'

export const Panel = memo(function Panel({ children }: { children: ReactNode }) {
  return <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>{children}</section>
})
