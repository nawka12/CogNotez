<script lang="ts">
  import { t } from '../i18n'
  import { importer, importFromFile, importFromV4 } from '../state/importer.svelte'
</script>

{#if importer.found}
  <section class="import" aria-labelledby="imp-h">
    <h2 id="imp-h">{t('import.title')}</h2>
    <p>{t('import.found', { n: importer.found.notes })}</p>
    <button class="btn primary" disabled={importer.running} onclick={() => void importFromV4()}>
      {importer.running ? t('import.running') : t('import.button')}
    </button>
    {#if importer.error}<p class="err" role="alert">{importer.error}</p>{/if}
  </section>
{/if}
<p class="drive">
  {t('import.driveHint')}
  <button class="btn" disabled={importer.running} onclick={() => void importFromFile()}>{t('import.driveButton')}</button>
</p>

<style>
  .import {
    margin: 0 0 1.6rem;
    padding: 14px 16px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--panel);
  }
  h2 {
    margin: 0 0 0.3rem;
    font: 600 14px var(--ui);
    color: var(--ink);
  }
  p {
    margin: 0 0 0.8rem;
  }
  .drive {
    display: grid;
    gap: 6px;
    justify-items: start;
    margin: 0 0 1.6rem;
    font-size: 13px;
  }
  .err {
    margin: 0.6rem 0 0;
    color: var(--rubric);
  }
</style>
