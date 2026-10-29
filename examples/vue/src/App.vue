<script setup>
import Counter from './Counter.vue'
import Panel from './Panel.vue'
</script>

<template>
  <main style="font-family: system-ui; padding: 24px">
    <h1>claude-locator · Vue</h1>
    <p>Hold Option (Alt) and click anything to open its source. Option+right-click shows the component tree.</p>
    <Panel>
      <Counter />
    </Panel>
  </main>
</template>
