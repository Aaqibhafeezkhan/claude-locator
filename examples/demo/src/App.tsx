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
        MIT · <a href="https://github.com/scs0209/claude-locator">github.com/scs0209/claude-locator</a>
      </footer>
    </div>
  )
}
