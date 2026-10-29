import { Counter } from './Counter'

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>claude-locator · React 19</h1>
      <p>Hold Option (Alt) and click anything to open its source in Claude.</p>
      <Counter />
    </main>
  )
}
