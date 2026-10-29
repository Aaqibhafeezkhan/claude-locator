export function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow">claude-locator</p>
      <h1>
        Hold <kbd>⌥ Option</kbd> and click.
        <br />
        Land on the line that drew it.
      </h1>
      <p className="lead">
        Point at anything in your running app and open its source where you work: Claude, Cursor, VS Code, OpenCode or
        Codex. React, Vue, Svelte, Solid, Preact, Astro and Angular.
      </p>
      <ul className="steps">
        <li>
          <kbd>⌥</kbd> + hover <span>outline and file:line</span>
        </li>
        <li>
          <kbd>⌥</kbd> + click <span>open it</span>
        </li>
        <li>
          <kbd>⌥</kbd> + right-click <span>the component tree</span>
        </li>
      </ul>
      <p className="note">On this page a click opens the file on GitHub. Needs a keyboard: try it on a desktop.</p>
    </header>
  )
}
