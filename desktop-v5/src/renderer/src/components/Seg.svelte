<script lang="ts" generics="T extends string">
  interface Option {
    value: T
    label: string
  }
  let { label, options, value, onpick }: { label: string; options: Option[]; value: T; onpick: (v: T) => void } = $props()
</script>

<div class="seg" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button aria-pressed={value === o.value} onclick={() => onpick(o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--rule);
    border-radius: 7px;
    background: var(--panel);
  }
  button {
    padding: 4px 12px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-2);
  }
  button:hover {
    color: var(--ink);
  }
  button[aria-pressed='true'] {
    background: var(--paper);
    color: var(--ink);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--rule);
  }
</style>
