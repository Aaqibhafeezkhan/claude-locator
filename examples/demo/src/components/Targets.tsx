const TARGETS = [
  { name: 'Claude desktop', how: 'Files pane, through the claude-locator plugin', option: "'claude'" },
  { name: 'Cursor · VS Code · Windsurf', how: 'a tab in the window you are using', option: "'editor'" },
  { name: 'Zed · WebStorm · others', how: 'through their launcher', option: "'editor'" },
  { name: 'OpenCode', how: 'typed into the TUI prompt', option: "'opencode'" },
  { name: 'Codex · any agent', how: 'copied, ready to paste', option: "'clipboard'" },
  { name: 'Anything else', how: 'a URL or a function of yours', option: '{ url } · fn' },
]

export function Targets() {
  return (
    <section className="targets">
      <h2>Opens where you work</h2>
      <div className="target-grid">
        {TARGETS.map((target) => (
          <div className="target" key={target.name}>
            <h3>{target.name}</h3>
            <p>{target.how}</p>
            <code>{target.option}</code>
          </div>
        ))}
      </div>
    </section>
  )
}
