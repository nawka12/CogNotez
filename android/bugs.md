Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

[Fixed]: Pressing back (app button or system back button) have unexpected behavior. Pressing app back button now does nothing (previously leads to black screen) and pressing system back button exits the app. This does not happen with regular notes.
  - Root cause: In home_screen.dart, the onComplete callback was calling Navigator.pop() to return the unlocked note, but PasswordDialog already calls Navigator.pop() after onComplete. This caused a double-pop which disrupted the navigation stack for encrypted notes.
  - Fix: Changed _openNote() to capture the result in a variable instead of calling Navigator.pop in the callback, letting the dialog handle its own closing.