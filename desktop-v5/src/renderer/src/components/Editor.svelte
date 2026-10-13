<script lang="ts">
  import { untrack } from 'svelte'
  import { EditorView } from '@codemirror/view'
  import { external } from '../editor/setup'
  import { t } from '../i18n'
  import { bodyChanged, insertText } from '../state/tabs.svelte'
  import type { Doc } from '../state/tabs.svelte'
  import { notImplemented, showToast } from '../state/ui.svelte'

  let { doc }: { doc: Doc } = $props()

  let host: HTMLDivElement
  let view: EditorView | undefined
  let attached: Doc | undefined

  // One EditorView serves every tab: switching swaps in that tab's own EditorState,
  // which carries its undo history and selection.
  $effect(() => {
    const d = doc
    untrack(() => {
      if (!view) {
        view = new EditorView({
          state: d.cm,
          parent: host,
          dispatchTransactions(trs, v) {
            v.update(trs)
            const cur = attached
            if (!cur) return
            cur.cm = v.state
            if (trs.some((tr) => tr.docChanged && !tr.annotation(external))) bodyChanged(cur)
          }
        })
      } else if (attached !== d) {
        if (attached) attached.view = null
        view.setState(d.cm)
      }
      attached = d
      d.view = view
    })
  })
  $effect(() => () => {
    if (attached) attached.view = null
    view?.destroy()
    view = undefined
    attached = undefined
  })

  const imagesIn = (dt: DataTransfer | null): File[] => [...(dt?.files ?? [])].filter((f) => f.type.startsWith('image/'))

  async function importImages(files: File[], target: Doc, pos?: number): Promise<void> {
    const lines: string[] = []
    for (const f of files) {
      try {
        const ref = await window.api.media.importBytes(new Uint8Array(await f.arrayBuffer()), f.type)
        lines.push(`![](${ref.url})`)
      } catch (e) {
        showToast(notImplemented(e) ? t('toast.imageUnavailable') : t('toast.imageFailed'))
        break
      }
    }
    if (lines.length) insertText(target, lines.join('\n'), pos)
  }

  function onpaste(e: ClipboardEvent): void {
    const files = imagesIn(e.clipboardData)
    if (!files.length || !attached) return
    e.preventDefault()
    e.stopPropagation()
    void importImages(files, attached)
  }
  function ondragover(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }
  function ondrop(e: DragEvent): void {
    const files = imagesIn(e.dataTransfer)
    if (!files.length || !attached || !view) return
    e.preventDefault()
    e.stopPropagation()
    void importImages(files, attached, view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined)
  }
  /** Capture phase, so we see image pastes before CodeMirror's own text handler. */
  function listen(node: HTMLElement): { destroy(): void } {
    node.addEventListener('paste', onpaste, true)
    node.addEventListener('dragover', ondragover, true)
    node.addEventListener('drop', ondrop, true)
    return {
      destroy() {
        node.removeEventListener('paste', onpaste, true)
        node.removeEventListener('dragover', ondragover, true)
        node.removeEventListener('drop', ondrop, true)
      }
    }
  }
</script>

<div class="editor" bind:this={host} use:listen></div>

<style>
  .editor {
    min-width: 0;
  }
</style>
