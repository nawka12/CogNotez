Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

[Fixed] Autosave not triggered when note starts with "Generate with AI": When using "Generate with AI" to create a note's initial content, autosave mechanism doesn't detect changes because insertTextAtCursor() was directly updating both editor value and currentNote.content simultaneously. Root cause: app.js insertTextAtCursor() (line 3210) updated this.currentNote.content, making it match editor value, so hasUnsavedChanges() returned false. Also affects unsaved changes dialog. Fixed by removing direct currentNote.content update and only dispatching input event, allowing autosave to detect the difference.
[Fixed] Unsaved changes dialog not triggered for AI-generated content: Same root cause as autosave bug - insertTextAtCursor() synchronized currentNote.content with editor, preventing hasUnsavedChanges() from detecting modifications. Fixed in same commit by removing the synchronous update.
[Fixed] Text inputs unresponsive after note deletion: After deleting a note via context menu, all text inputs (textboxes, textareas) sometimes become unresponsive. Opening and closing DevTools (Ctrl+Shift+I) would fix it, indicating a rendering/focus issue. Root cause: Native confirm() dialog can leave focus in stuck state or block event propagation. Fixed in notes.js (lines 241-353) by: (1) replacing native confirm() with custom modal system that has proper focus management, (2) implementing forceReflow() method that triggers browser reflow (void body.offsetHeight) and manages focus cycle to clear any stuck states.