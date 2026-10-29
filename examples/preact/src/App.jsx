import { Counter } from './Counter'
import { Panel } from './Panel'

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '24px' }}>
      <h1>claude-locator · Preact</h1>
      <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
      <Panel>
        <Counter />
      </Panel>
    </main>
  )
}
