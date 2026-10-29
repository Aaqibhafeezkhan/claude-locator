import claudeLocator, { CLIENT_MODULE_ID, type ClaudeLocatorOptions } from './index'

/** The part of Astro's integration API this uses, so the package does not depend on astro. */
interface AstroIntegration {
  name: string
  hooks: {
    'astro:config:setup': (params: {
      command: 'dev' | 'build' | 'preview' | 'sync'
      updateConfig: (config: { vite: { plugins: unknown[] } }) => unknown
      injectScript: (stage: 'page', content: string) => void
    }) => void
  }
}

/**
 * claude-locator as an Astro integration: `integrations: [claudeLocator()]` in astro.config.
 * Astro renders its own HTML, so the page script comes in through `injectScript` rather than `index.html`.
 */
export default function claudeLocatorAstro(options: ClaudeLocatorOptions = {}): AstroIntegration {
  return {
    name: 'claude-locator',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, injectScript }) => {
        if (command !== 'dev') {
          return
        }
        updateConfig({ vite: { plugins: [claudeLocator({ ...options, injectClient: false })] } })
        injectScript('page', `import ${JSON.stringify(CLIENT_MODULE_ID)}`)
      },
    },
  }
}

export { claudeLocatorAstro }
