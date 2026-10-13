<script lang="ts">
  import { t } from '../i18n'
  import Icon from './Icon.svelte'
</script>

<div class="locked">
  <h2><Icon name="lock" />{t('locked.title')}</h2>
  <p>{t('locked.body')}</p>
  <p class="hint">{t('locked.soon')}</p>
</div>

<style>
  .locked {
    max-width: 24rem;
    padding: 1.5rem 0;
    color: var(--ink-2);
    font-size: 14px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 0.4rem;
    font: 600 15px var(--ui);
    color: var(--ink);
  }
  p {
    margin: 0 0 0.6rem;
  }
  .hint {
    color: var(--ink-3);
  }
</style>
