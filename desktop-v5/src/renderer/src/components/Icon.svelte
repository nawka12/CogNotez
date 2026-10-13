<script lang="ts">
  let { name, class: cls = '' }: { name: string; class?: string } = $props()
</script>

<svg class="i {cls}" aria-hidden="true"><use href="#i-{name}" /></svg>
