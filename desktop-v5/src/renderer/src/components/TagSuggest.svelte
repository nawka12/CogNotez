<script lang="ts">
  import { t } from '../i18n'
  import { tabs, saveMeta } from '../state/tabs.svelte'
  import { mergeTags } from '../lib/tags'
  import { ui } from '../state/ui.svelte'

  let dlg: HTMLDialogElement
  let picked = $state<string[]>([])

  $effect(() => {
    if (ui.tagSuggest && !dlg.open) {
      picked = [...ui.tagSuggest.tags]
      dlg.showModal()
    } else if (!ui.tagSuggest && dlg.open) dlg.close()
  })

  const toggle = (tag: string): void => {
    picked = picked.includes(tag) ? picked.filter((x) => x !== tag) : [...picked, tag]
  }

  async function add(): Promise<void> {
    const s = ui.tagSuggest
    ui.tagSuggest = null
    const doc = tabs.list.find((d) => d.id === s?.docId)
    if (doc && picked.length) await saveMeta(doc, { tags: mergeTags(doc.note.tags, picked) })
  }
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="ts-title" onclose={() => (ui.tagSuggest = null)}>
  {#if ui.tagSuggest}
    <div class="body">
      <h2 id="ts-title">{t('ai.tagsTitle')}</h2>
      <p>{t('ai.tagsHelp')}</p>
      <div class="chips" role="group" aria-label={t('ai.tagsTitle')}>
        {#each ui.tagSuggest.tags as tag (tag)}
          <button class="chip" aria-pressed={picked.includes(tag)} onclick={() => toggle(tag)}>#{tag}</button>
        {/each}
      </div>
      <div class="acts">
        <button class="btn" onclick={() => (ui.tagSuggest = null)}>{t('confirm.cancel')}</button>
        <button class="btn primary" disabled={!picked.length} onclick={() => void add()}>{t('ai.tagsAdd')}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
  }
  .body {
    padding: 18px 20px;
  }
  h2 {
    margin: 0 0 0.4rem;
    font: 600 15px var(--ui);
  }
  p {
    margin: 0 0 0.8rem;
    color: var(--ink-2);
    font-size: 14px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 4px 10px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink-2);
  }
  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--ink);
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
</style>
