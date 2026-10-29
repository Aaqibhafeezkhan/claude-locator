import { Counter } from './Counter'
import { Panel } from './Panel'

export function App() {
  return (
    <main style={{ 'font-family': 'system-ui', padding: '24px' }}>
      <h1>claude-locator · Solid</h1>
      <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
      <Panel>
        <Counter />
      </Panel>
    </main>
  )
}
