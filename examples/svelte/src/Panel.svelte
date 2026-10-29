<script>
  let { children } = $props()
</script>

<section style="border: 1px solid #ccc; border-radius: 8px; padding: 16px">
  {@render children()}
</section>
