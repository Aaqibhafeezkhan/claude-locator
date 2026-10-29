import { Counter } from './Counter'
import { Panel } from './Panel'

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>claude-locator · React 19</h1>
      <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
      <Panel>
        <Counter />
      </Panel>
    </main>
  )
}
