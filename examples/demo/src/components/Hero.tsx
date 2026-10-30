export function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow brand">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
        claude-locator · click-to-source for agents
      </p>
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
          <span className="eyebrow">01</span>
          <div>
            <kbd>⌥</kbd> + hover
          </div>
          <span>outline and file:line</span>
        </li>
        <li>
          <span className="eyebrow">02</span>
          <div>
            <kbd>⌥</kbd> + click
          </div>
          <span>open that line</span>
        </li>
        <li>
          <span className="eyebrow">03</span>
          <div>
            <kbd>⌥</kbd> + right-click
          </div>
          <span>the component tree</span>
        </li>
      </ul>
      <p className="note">On this page a click opens the file on GitHub. Needs a keyboard: try it on a desktop.</p>
    </header>
  )
}
