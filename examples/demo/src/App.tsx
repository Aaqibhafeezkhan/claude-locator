import { Hero } from './components/Hero'
import { Install } from './components/Install'
import { LocationLog } from './components/LocationLog'
import { Playground } from './components/Playground'
import { Targets } from './components/Targets'

export function App() {
  return (
    <div className="page">
      <Hero />
      <section className="try">
        <Playground />
        <LocationLog />
      </section>
      <Targets />
      <Install />
      <footer className="footer">
        <span>
          MIT · <a href="https://github.com/scs0209/claude-locator">github.com/scs0209/claude-locator</a>
        </span>
        <span>
          Design tokens: <a href="https://github.com/nexu-io/open-design/tree/main/design-systems/mono">OpenDesign Mono</a>{' '}
          (Apache-2.0)
        </span>
      </footer>
    </div>
  )
}
