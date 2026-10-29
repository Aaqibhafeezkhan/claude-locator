<script>
  import Panel from './Panel.svelte'
  import Counter from './Counter.svelte'
</script>

<main style="font-family: system-ui; padding: 24px">
  <h1>claude-locator · Svelte</h1>
  <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
  <Panel>
    <Counter />
  </Panel>
</main>
