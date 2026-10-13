interface KeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  isComposing: boolean
}

/** Esc / Mod-Enter for a pending AI review. Null when someone else already used the key (the editor, a tag input). */
export function reviewKey(e: KeyEvent): 'accept' | 'reject' | null {
  if (e.defaultPrevented || e.isComposing || e.shiftKey || e.altKey) return null
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'Escape') return mod ? null : 'reject'
  return e.key === 'Enter' && mod ? 'accept' : null
}
