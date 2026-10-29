import { useEffect, useState } from 'react'

type Location = { file: string; line?: number }

export function LocationLog() {
  const [entries, setEntries] = useState<Location[]>([])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const location = (event as CustomEvent<Location>).detail
      setEntries((previous) => [location, ...previous].slice(0, 6))
    }
    window.addEventListener('claude-locator:open', onOpen)
    return () => window.removeEventListener('claude-locator:open', onOpen)
  }, [])

  return (
    <aside className="panel log">
      <div className="panel-head">
        <span className="eyebrow">Opened</span>
        <span className="eyebrow">{entries.length}</span>
      </div>
      <div className="log-body">
        {entries.length === 0 ? (
          <p className="log-empty">Option+click something on the left.</p>
        ) : (
          <ol>
            {entries.map((entry, index) => (
              <li key={`${entry.file}:${entry.line}:${index}`}>
                <code>
                  {entry.file}:{entry.line}
                </code>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}
