<script lang="ts">
  import { dismissToast, ui } from '../state/ui.svelte'

  function act(): void {
    const run = ui.toast?.action?.run
    dismissToast()
    run?.()
  }
</script>

<div class="toast" role="status" aria-live="polite">
  {#if ui.toast}
    <span>{ui.toast.message}</span>
    {#if ui.toast.action}<button onclick={act}>{ui.toast.action.label}</button>{/if}
  {/if}
</div>

<style>
  .toast {
    position: absolute;
    left: 50%;
    bottom: 44px;
    z-index: 20;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100% - 32px);
    padding: 8px 8px 8px 14px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--paper);
    box-shadow: var(--shadow);
    font-size: 13.5px;
  }
  .toast:empty {
    display: none;
  }
  button {
    padding: 4px 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--invert-accent);
    font-weight: 600;
  }
</style>
