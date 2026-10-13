<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../i18n'
  import { hintKeys, remoteName } from '../lib/aiText'
  import { ai, openModelList, setCompanionOpen } from '../state/ai.svelte'
  import { askEdit, suggestTags } from '../state/aiedit.svelte'
  import {
    askClearHistory,
    comp,
    copyResult,
    dismissQuick,
    insertBelow,
    loadThread,
    runQuick,
    sendChat,
    stopChat,
    stopQuick
  } from '../state/companion.svelte'
  import { tabs } from '../state/tabs.svelte'
  import Bubble from './Bubble.svelte'
  import Icon from './Icon.svelte'

  let input = $state('')
  let research = $state(false)
  let thread: HTMLDivElement

  const doc = $derived(tabs.current)
  const key = $derived(doc?.id ?? null)
  const locked = $derived(!!doc?.note.locked)
  const model = $derived(ai.config?.model ?? '')
  const hint = $derived(
    hintKeys(!ai.local, research && !!ai.config?.searxngUrl)
      .map((k) => t(k, { provider: ai.config ? remoteName(ai.config.provider, ai.config.baseUrl) : '' }))
      .join(' ')
  )


  // The thread belongs to the open note: switching notes switches it.
  $effect(() => {
    if (ai.open) void loadThread(key)
  })

  const quick = $derived(comp.quick.filter((q) => q.key === key))
  const live = $derived(comp.chat && comp.chat.key === key ? comp.chat : null)
  // The stored thread already holds the user's message once the answer is done.
  const empty = $derived(!comp.thread.length && !quick.length && !live)

  // Keep the newest text in view, unless the reader scrolled up.
  $effect(() => {
    void comp.thread.length
    void live?.text
    void quick.map((q) => q.text)
    if (!thread) return
    if (thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120) void tick().then(() => (thread.scrollTop = thread.scrollHeight))
  })

  function submit(e?: SubmitEvent): void {
    e?.preventDefault()
    if (comp.chat?.running) return stopChat()
    const text = input
    if (!text.trim() || locked || comp.busy) return
    input = ''
    void sendChat(doc, text, research && !!ai.config?.searxngUrl)
  }
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && comp.chat?.running) {
      e.preventDefault()
      stopChat()
    }
  }
  const ctx = (model: string | null): string => t('ai.used', { what: t(key ? 'ai.thisNote' : 'ai.noNote'), model: model ?? '' })
  const canChip = $derived(!!doc && !locked && !comp.busy && !doc.sealed)
</script>

<aside class="comp" aria-label={t('ai.title')}>
  <div class="comp-head">
    <h2>{t('ai.title')}</h2>
    <button class="model" class:remote={!ai.local} onclick={openModelList} title={t('ai.switchModel')}>
      <span class="dot"></span><span>{model || t('ai.noModel')}</span>
    </button>
    <button class="icon-btn" aria-label={t('ai.clear')} title={t('ai.clear')} disabled={locked || empty} onclick={() => askClearHistory(key)}>
      <Icon name="trash" />
    </button>
    <button class="icon-btn" aria-label={t('ai.close')} title={t('ai.close')} onclick={() => setCompanionOpen(false)}><Icon name="x" /></button>
  </div>

  <div class="thread" role="log" aria-live="polite" bind:this={thread}>
    {#if locked}
      <p class="empty">{t('ai.locked')}</p>
    {:else}
      {#each comp.thread as m (m.id)}
        {#if m.role === 'user'}
          <div class="msg user">{m.content}</div>
        {:else}
          <div class="msg ai"><Bubble text={m.content} /><div class="ctx">{ctx(m.model)}</div></div>
        {/if}
      {/each}
      {#each quick as q (q.id)}
        <div class="msg ai">
          {#if q.text}<Bubble text={q.text} streaming={q.running} />{/if}
          {#if q.running && !q.text}<p class="wait">{t('ai.thinking')}</p>{/if}
          {#if q.error}<p class="err" role="alert">{q.error}</p>{/if}
          <div class="acts">
            {#if q.running}
              <button class="btn" onclick={() => stopQuick(q)}><Icon name="stop" />{t('ai.stop')}</button>
            {:else}
              {#if q.text}
                <button class="btn" onclick={() => insertBelow(q)}>{t('ai.insertBelow')}</button>
                <button class="btn" onclick={() => void copyResult(q.text)}>{t('ai.copy')}</button>
              {/if}
              <button class="btn" onclick={() => dismissQuick(q)}>{t('ai.dismiss')}</button>
            {/if}
          </div>
          <div class="ctx">{t('ai.notStored')}</div>
        </div>
      {/each}
      {#if live}
        <div class="msg user">{live.user}</div>
        <div class="msg ai">
          {#if live.text}<Bubble text={live.text} streaming={live.running} />{/if}
          {#if live.running && !live.text}<p class="wait">{t('ai.thinking')}</p>{/if}
          {#if live.error}<p class="err" role="alert">{live.error}</p>{/if}
          {#if live.running}<div class="ctx">{t('ai.usedLive', { what: t(key ? 'ai.thisNote' : 'ai.noNote'), search: t(live.research ? 'ai.searchOn' : 'ai.searchOff'), model })}</div>{/if}
        </div>
      {/if}
      {#if empty}<p class="empty">{t(key ? 'ai.emptyNote' : 'ai.emptyGlobal')}</p>{/if}
    {/if}
  </div>

  <div class="chips" aria-label={t('ai.quick')}>
    <button class="chip" disabled={!canChip} onclick={() => doc && void runQuick(doc, 'summarize')}>{t('ai.chip.summarize')}</button>
    <button class="chip" disabled={!canChip} onclick={() => doc && void runQuick(doc, 'keyPoints')}>{t('ai.chip.keyPoints')}</button>
    <button class="chip" disabled={!canChip} onclick={() => askEdit('translate')}>{t('ai.chip.translate')}</button>
    <button class="chip" disabled={!canChip} onclick={() => void suggestTags()}>{t('ai.chip.tags')}</button>
  </div>

  <form class="composer" onsubmit={submit}>
    <label for="ask" class="sr">{t('ai.ask')}</label>
    <textarea
      id="ask"
      bind:value={input}
      rows="2"
      disabled={locked}
      placeholder={t(key ? 'ai.placeholderNote' : 'ai.placeholderGlobal')}
      {onkeydown}
    ></textarea>
    <div class="composer-row">
      {#if ai.config?.searxngUrl}
        <label class="research"><input type="checkbox" bind:checked={research} disabled={locked} /> {t('ai.research')}</label>
      {:else}
        <span></span>
      {/if}
      {#if comp.chat?.running}
        <button class="btn" type="button" aria-label={t('ai.stop')} title={t('ai.stop')} onclick={stopChat}><Icon name="stop" />{t('ai.stop')}</button>
      {:else}
        <button class="btn primary" type="submit" aria-label={t('ai.send')} disabled={locked || comp.busy || !input.trim()}><Icon name="up" /></button>
      {/if}
    </div>
    <p class="hint">{hint}</p>
  </form>
</aside>

<style>
  .comp {
    grid-row: 1;
    grid-column: 3;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel);
    border-left: 1px solid var(--rule);
  }
  .comp-head {
    height: 44px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 14px;
    border-bottom: 1px solid var(--rule);
  }
  h2 {
    margin: 0;
    font: 600 13.5px var(--ui);
  }
  .model {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 26px;
    margin-right: auto;
    padding: 0 8px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink-2);
  }
  .model span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    flex: none;
  }
  .model.remote .dot {
    background: var(--rubric);
  }
  .icon-btn:disabled {
    opacity: 0.4;
  }
  .thread {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .msg.user {
    align-self: flex-end;
    max-width: 88%;
    padding: 8px 12px;
    border-radius: 10px 10px 3px 10px;
    background: var(--sunk);
    font-size: 13.5px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg.ai {
    color: var(--ink);
  }
  .ctx {
    margin-top: 6px;
    font: 13px/1.4 var(--ui);
    color: var(--ink-3);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .acts .btn {
    height: 26px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  .empty,
  .wait {
    margin: 0;
    color: var(--ink-3);
    font-size: 13.5px;
  }
  .err {
    margin: 6px 0 0;
    color: var(--rubric);
    font-size: 13.5px;
    overflow-wrap: anywhere;
  }
  .chips {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 16px 10px;
  }
  .chip {
    padding: 4px 10px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink-2);
  }
  .chip:hover:not(:disabled) {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .chip:disabled {
    opacity: 0.5;
  }
  .composer {
    flex: none;
    display: grid;
    gap: 8px;
    padding: 12px 16px 14px;
    border-top: 1px solid var(--rule);
  }
  textarea {
    width: 100%;
    resize: none;
    padding: 8px 10px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--paper);
    font: 14px/1.5 var(--ui);
  }
  textarea:disabled {
    opacity: 0.55;
  }
  .composer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .research {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    cursor: pointer;
  }
  .research input {
    accent-color: var(--accent);
    margin: 0;
  }
  .hint {
    margin: 0;
    color: var(--ink-3);
  }
</style>
