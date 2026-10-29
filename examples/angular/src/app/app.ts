import { Component } from '@angular/core'
import { Counter } from './counter'
import { Panel } from './panel'

@Component({
  selector: 'app-root',
  imports: [Counter, Panel],
  template: `
    <main style="font-family: system-ui; padding: 24px">
      <h1>claude-locator · Angular</h1>
      <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
      <app-panel>
        <app-counter />
      </app-panel>
    </main>
  `,
})
export class App {}
