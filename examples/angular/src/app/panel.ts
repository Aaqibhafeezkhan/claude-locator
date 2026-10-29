import { Component } from '@angular/core'

@Component({
  selector: 'app-panel',
  template: `<section style="border: 1px solid #ccc; border-radius: 8px; padding: 16px"><ng-content /></section>`,
})
export class Panel {}
