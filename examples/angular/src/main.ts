import { isDevMode, provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app/app'

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] })

// Talks to `npx claude-locator`, which serves the open endpoint the Angular CLI dev server cannot
if (isDevMode()) {
  import('vite-plugin-claude-locator/client').then(({ startClaudeLocator }) => startClaudeLocator())
}
