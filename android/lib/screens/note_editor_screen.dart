import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import '../models/note.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../services/export_service.dart';
import '../services/ai_service.dart';
import '../services/settings_service.dart';
import '../services/media_storage_service.dart';
import '../widgets/find_replace_dialog.dart';
import '../widgets/password_dialog.dart';

enum ViewMode { edit, preview, split }

class _EditorState {
  final String title;
  final String content;
  
  _EditorState({required this.title, required this.content});
  
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is _EditorState &&
        other.title == title &&
        other.content == content;
  }
  
  @override
  int get hashCode => title.hashCode ^ content.hashCode;
}

class NoteEditorScreen extends StatefulWidget {
  final Note note;
  final bool isNew;

  const NoteEditorScreen({
    super.key,
    required this.note,
    required this.isNew,
  });

  @override
  State<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends State<NoteEditorScreen> with WidgetsBindingObserver {
  late TextEditingController _titleController;
  late TextEditingController _contentController;
  ViewMode _viewMode = ViewMode.edit;
  bool _hasChanges = false;
  bool _isNew = false;
  late Note _currentNote;
  final ExportService _exportService = ExportService();
  
  // Find & Replace
  bool _showFindReplace = false;
  
  // AI features
  bool _isAiLoading = false;
  
  // Password protection
  String? _currentPassword;
  
  // Undo/Redo history
  final List<_EditorState> _history = [];
  int _historyIndex = -1;
  static const int _maxHistorySize = 50;
  bool _isRecordingHistory = true;
  DateTime? _lastHistorySaveTime;
  
  // Auto-save
  Timer? _autoSaveTimer;
  Timer? _typingPauseTimer;
  static const Duration _autoSaveInterval = Duration(seconds: 15);
  static const Duration _typingPauseDelay = Duration(milliseconds: 500);
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _isNew = widget.isNew;
    _currentNote = widget.note;
    _titleController = TextEditingController(text: widget.note.title);
    _contentController = TextEditingController(text: widget.note.content);
    _titleController.addListener(_onTitleChanged);
    _contentController.addListener(_onContentChanged);
    _saveState();
    _startAutoSave();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopAutoSave();
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Auto-save when app goes to background
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      if (_hasChanges && !_isSaving) {
        _performAutoSave();
      }
    }
  }

  void _startAutoSave() {
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer.periodic(_autoSaveInterval, (_) {
      if (_hasChanges && !_isSaving && mounted) {
        _performAutoSave();
      }
    });
  }

  void _stopAutoSave() {
    _autoSaveTimer?.cancel();
    _autoSaveTimer = null;
    _typingPauseTimer?.cancel();
    _typingPauseTimer = null;
  }

  Future<void> _performAutoSave() async {
    if (_isSaving || !_hasChanges) return;
    
    _isSaving = true;
    try {
      final notesService = Provider.of<NotesService>(context, listen: false);
      final updatedNote = _currentNote.copyWith(
        title: _titleController.text,
        content: _contentController.text,
        updatedAt: DateTime.now(),
      );

      if (_isNew) {
        await notesService.createNote(updatedNote);
        _isNew = false;
      } else {
        await notesService.updateNote(updatedNote);
      }

      if (mounted) {
        setState(() {
          _hasChanges = false;
          _currentNote = updatedNote;
        });
      }
    } catch (e) {
      // Silently fail auto-save to not interrupt user
      debugPrint('Auto-save failed: $e');
    } finally {
      _isSaving = false;
    }
  }

  void _onTitleChanged() {
    _markChanged();
    // Immediate auto-save for title changes
    _typingPauseTimer?.cancel();
    _typingPauseTimer = Timer(_typingPauseDelay, () {
      if (_hasChanges && !_isSaving && mounted) {
        _performAutoSave();
      }
    });
  }

  void _onContentChanged() {
    _markChanged();
    // Debounced auto-save for content changes
    _typingPauseTimer?.cancel();
    _typingPauseTimer = Timer(_typingPauseDelay, () {
      if (_hasChanges && !_isSaving && mounted) {
        _performAutoSave();
      }
    });
    
    // Also save to undo history after typing pause
    _lastHistorySaveTime = DateTime.now();
    Future.delayed(const Duration(milliseconds: 1000), () {
      if (_isRecordingHistory &&
          mounted &&
          _lastHistorySaveTime != null &&
          DateTime.now().difference(_lastHistorySaveTime!).inMilliseconds >= 1000) {
        _saveState();
      }
    });
  }

  void _markChanged() {
    if (!_hasChanges) {
      setState(() {
        _hasChanges = true;
      });
    }
  }
  
  void _saveState() {
    if (!_isRecordingHistory) return;
    
    final state = _EditorState(
      title: _titleController.text,
      content: _contentController.text,
    );
    
    if (_historyIndex < _history.length - 1) {
      _history.removeRange(_historyIndex + 1, _history.length);
    }
    
    if (_history.isEmpty || 
        (_historyIndex >= 0 && _history[_historyIndex] != state)) {
      _history.add(state);
      _historyIndex = _history.length - 1;
      
      if (_history.length > _maxHistorySize) {
        _history.removeAt(0);
        _historyIndex--;
      }
    }
  }
  
  bool get _canUndo => _historyIndex > 0;
  bool get _canRedo => _historyIndex < _history.length - 1;
  
  void _undo() {
    if (!_canUndo) return;
    
    _isRecordingHistory = false;
    _historyIndex--;
    final state = _history[_historyIndex];
    _titleController.text = state.title;
    _contentController.text = state.content;
    _isRecordingHistory = true;
    
    setState(() {
      _hasChanges = true;
    });
  }
  
  void _redo() {
    if (!_canRedo) return;
    
    _isRecordingHistory = false;
    _historyIndex++;
    final state = _history[_historyIndex];
    _titleController.text = state.title;
    _contentController.text = state.content;
    _isRecordingHistory = true;
    
    setState(() {
      _hasChanges = true;
    });
  }

  Future<void> _saveNote({bool showFeedback = true}) async {
    if (_isSaving) return;
    
    _isSaving = true;
    try {
      final notesService = Provider.of<NotesService>(context, listen: false);
      final updatedNote = _currentNote.copyWith(
        title: _titleController.text,
        content: _contentController.text,
        updatedAt: DateTime.now(),
      );

      if (_isNew) {
        await notesService.createNote(updatedNote);
      } else {
        await notesService.updateNote(updatedNote);
      }

      setState(() {
        _hasChanges = false;
        _isNew = false;
        _currentNote = updatedNote;
      });

      if (mounted && showFeedback) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Note saved'),
            duration: Duration(seconds: 1),
          ),
        );
      }
    } finally {
      _isSaving = false;
    }
  }

  Note _getCurrentNote() {
    return _currentNote.copyWith(
      title: _titleController.text,
      content: _contentController.text,
    );
  }

  Future<bool> _onWillPop() async {
    if (!_hasChanges) return true;
    
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Unsaved Changes'),
        content: const Text('You have unsaved changes. Do you want to discard them?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard', style: TextStyle(color: Colors.red)),
          ),
          FilledButton(
            onPressed: () async {
              await _saveNote();
              if (context.mounted) {
                Navigator.pop(context, true);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    
    return result ?? false;
  }

  void _showTagsDialog() async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final allTags = notesService.tags;
    final selectedTagIds = List<String>.from(_currentNote.tags);

    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Manage Tags'),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (allTags.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16.0),
                    child: Text('No tags available. Create tags in the main screen.'),
                  )
                else
                  ...allTags.map((tag) => CheckboxListTile(
                    title: Text(tag.name),
                    value: selectedTagIds.contains(tag.id),
                    onChanged: (checked) {
                      setDialogState(() {
                        if (checked == true) {
                          selectedTagIds.add(tag.id);
                        } else {
                          selectedTagIds.remove(tag.id);
                        }
                      });
                    },
                  )),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                setState(() {
                  _currentNote = _currentNote.copyWith(tags: selectedTagIds);
                  _hasChanges = true;
                });
                Navigator.pop(context);
              },
              child: const Text('Apply'),
            ),
          ],
        ),
      ),
    );
  }

  // AI Features
  Future<AIService> _getAIService() async {
    final settingsService = SettingsService();
    await settingsService.loadSettings();
    return AIService(settingsService.settings);
  }

  String _getSelectedText() {
    final selection = _contentController.selection;
    if (selection.isValid && selection.start != selection.end) {
      return _contentController.text.substring(selection.start, selection.end);
    }
    return '';
  }

  void _replaceSelectedText(String newText) {
    final selection = _contentController.selection;
    if (selection.isValid && selection.start != selection.end) {
      final text = _contentController.text;
      final newContent = text.substring(0, selection.start) + newText + text.substring(selection.end);
      _contentController.text = newContent;
      _contentController.selection = TextSelection.collapsed(offset: selection.start + newText.length);
    }
  }

  void _insertText(String text) {
    final selection = _contentController.selection;
    final currentText = _contentController.text;
    final insertPosition = selection.isValid ? selection.start : currentText.length;
    final newContent = currentText.substring(0, insertPosition) + text + currentText.substring(insertPosition);
    _contentController.text = newContent;
    _contentController.selection = TextSelection.collapsed(offset: insertPosition + text.length);
  }

  Future<void> _performAIAction(String action) async {
    final selectedText = _getSelectedText();
    
    setState(() {
      _isAiLoading = true;
    });

    try {
      final aiService = await _getAIService();
      String result;

      switch (action) {
        case 'summarize':
          final textToSummarize = selectedText.isNotEmpty ? selectedText : _contentController.text;
          result = await aiService.summarize(textToSummarize);
          _showAIResultDialog('Summary', result);
          break;
        case 'ask':
          final question = await _showInputDialog('Ask AI', 'Enter your question:');
          if (question != null && question.isNotEmpty) {
            final context = selectedText.isNotEmpty ? selectedText : _contentController.text;
            result = await aiService.askQuestion(context, question);
            _showAIResultDialog('AI Response', result);
          }
          break;
        case 'edit':
          if (selectedText.isEmpty) {
            _showMessage('Please select text to edit');
            break;
          }
          final instruction = await _showInputDialog('Edit with AI', 'How should I edit this text?');
          if (instruction != null && instruction.isNotEmpty) {
            result = await aiService.editText(selectedText, instruction);
            _showAIEditApprovalDialog(selectedText, result);
          }
          break;
        case 'rewrite':
          if (selectedText.isEmpty) {
            _showMessage('Please select text to rewrite');
            break;
          }
          result = await aiService.editText(selectedText, 'Rewrite this text to improve clarity and readability while maintaining the original meaning.');
          _showAIEditApprovalDialog(selectedText, result);
          break;
        case 'generate':
          final prompt = await _showInputDialog('Generate Content', 'What would you like me to generate?');
          if (prompt != null && prompt.isNotEmpty) {
            result = await aiService.generateContent(prompt);
            _showAIInsertDialog(result);
          }
          break;
        case 'keypoints':
          final textToAnalyze = selectedText.isNotEmpty ? selectedText : _contentController.text;
          final points = await aiService.extractKeyPoints(textToAnalyze);
          result = points.map((p) => '• $p').join('\n');
          _showAIResultDialog('Key Points', result);
          break;
        case 'tags':
          final textToAnalyze = selectedText.isNotEmpty ? selectedText : _contentController.text;
          final tags = await aiService.generateTags(textToAnalyze);
          _showGeneratedTagsDialog(tags);
          break;
      }
    } catch (e) {
      _showMessage('AI Error: $e');
    } finally {
      setState(() {
        _isAiLoading = false;
      });
    }
  }

  Future<String?> _showInputDialog(String title, String hint) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(hintText: hint),
          autofocus: true,
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  void _showAIResultDialog(String title, String result) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: SelectableText(result),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          FilledButton(
            onPressed: () {
              _insertText('\n\n$result');
              Navigator.pop(context);
            },
            child: const Text('Insert'),
          ),
        ],
      ),
    );
  }

  void _showAIEditApprovalDialog(String original, String edited) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('AI Edit Suggestion'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Original:', style: TextStyle(fontWeight: FontWeight.bold)),
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(original),
              ),
              const Text('Suggested:', style: TextStyle(fontWeight: FontWeight.bold)),
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(edited),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Reject'),
          ),
          FilledButton(
            onPressed: () {
              _replaceSelectedText(edited);
              Navigator.pop(context);
            },
            child: const Text('Accept'),
          ),
        ],
      ),
    );
  }

  void _showAIInsertDialog(String content) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Generated Content'),
        content: SingleChildScrollView(
          child: SelectableText(content),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              _insertText(content);
              Navigator.pop(context);
            },
            child: const Text('Insert'),
          ),
        ],
      ),
    );
  }

  void _showGeneratedTagsDialog(List<String> suggestedTags) async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final existingTags = notesService.tags;
    
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Suggested Tags'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('AI suggests these tags:'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: suggestedTags.map((tagName) {
                  final existingTag = existingTags.cast<Tag?>().firstWhere(
                    (t) => t?.name.toLowerCase() == tagName.toLowerCase(),
                    orElse: () => null,
                  );
                  final isAlreadyApplied = existingTag != null && 
                      _currentNote.tags.contains(existingTag.id);
                  
                  return ActionChip(
                    label: Text(tagName),
                    avatar: isAlreadyApplied 
                        ? const Icon(Icons.check, size: 16) 
                        : null,
                    onPressed: isAlreadyApplied ? null : () async {
                      // Find or create tag
                      Tag? tag = existingTag;
                      if (tag == null) {
                        // Would need to create the tag - for now just show message
                        _showMessage('Tag "$tagName" would be created and applied');
                      } else {
                        setState(() {
                          final newTags = List<String>.from(_currentNote.tags)..add(tag.id);
                          _currentNote = _currentNote.copyWith(tags: newTags);
                          _hasChanges = true;
                        });
                      }
                      Navigator.pop(context);
                    },
                  );
                }).toList(),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showMessage(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  void _showAIContextMenu() {
    final selectedText = _getSelectedText();
    
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.summarize),
              title: const Text('Summarize'),
              subtitle: Text(selectedText.isEmpty ? 'Summarize entire note' : 'Summarize selection'),
              onTap: () {
                Navigator.pop(context);
                _performAIAction('summarize');
              },
            ),
            ListTile(
              leading: const Icon(Icons.question_answer),
              title: const Text('Ask AI'),
              subtitle: Text(selectedText.isEmpty ? 'Ask about the note' : 'Ask about selection'),
              onTap: () {
                Navigator.pop(context);
                _performAIAction('ask');
              },
            ),
            if (selectedText.isNotEmpty) ...[
              ListTile(
                leading: const Icon(Icons.edit),
                title: const Text('Edit with AI'),
                subtitle: const Text('Transform selected text'),
                onTap: () {
                  Navigator.pop(context);
                  _performAIAction('edit');
                },
              ),
              ListTile(
                leading: const Icon(Icons.refresh),
                title: const Text('Rewrite'),
                subtitle: const Text('Improve clarity'),
                onTap: () {
                  Navigator.pop(context);
                  _performAIAction('rewrite');
                },
              ),
            ],
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: const Text('Generate Content'),
              subtitle: const Text('Create new content with AI'),
              onTap: () {
                Navigator.pop(context);
                _performAIAction('generate');
              },
            ),
            ListTile(
              leading: const Icon(Icons.list),
              title: const Text('Extract Key Points'),
              subtitle: Text(selectedText.isEmpty ? 'From entire note' : 'From selection'),
              onTap: () {
                Navigator.pop(context);
                _performAIAction('keypoints');
              },
            ),
            ListTile(
              leading: const Icon(Icons.label),
              title: const Text('Suggest Tags'),
              subtitle: const Text('Generate tags with AI'),
              onTap: () {
                Navigator.pop(context);
                _performAIAction('tags');
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showSetPasswordDialog() {
    showDialog(
      context: context,
      builder: (context) => PasswordDialog(
        note: _currentNote.copyWith(content: _contentController.text),
        isUnlocking: false,
        onComplete: (updatedNote, password) {
          setState(() {
            _currentNote = updatedNote;
            _currentPassword = password;
            _hasChanges = true;
          });
          _showMessage('Password protection enabled');
        },
      ),
    );
  }

  void _showRemovePasswordDialog() async {
    String? obtainedPassword;

    if (_currentPassword == null) {
      // If we don't have the current password, show unlock dialog first
      obtainedPassword = await showDialog<String>(
        context: context,
        builder: (context) => PasswordDialog(
          note: _currentNote,
          isUnlocking: true,
          onComplete: (updatedNote, password) {
            // Store the password and close the dialog
            obtainedPassword = password;
            Navigator.pop(context, password);
          },
        ),
      );

      if (obtainedPassword == null) {
        // User cancelled the unlock dialog
        return;
      }

      // Now we have the password, proceed to remove protection
      _currentPassword = obtainedPassword;
    }

    // Remove password protection directly
    try {
      final unlockedNote = _currentNote.copyWith(
        isPasswordProtected: false,
        clearEncryption: true,
      );

      setState(() {
        _currentNote = unlockedNote;
        _currentPassword = null;
        _hasChanges = true;
      });

      // Save the changes to database immediately
      final notesService = Provider.of<NotesService>(context, listen: false);
      await notesService.updateNote(unlockedNote);

      _showMessage('Password protection removed');
    } catch (e) {
      _showMessage('Failed to remove password protection: $e');
    }
  }

  Future<void> _handleMenuAction(String action) async {
    final note = _getCurrentNote();
    
    try {
      switch (action) {
        case 'undo':
          _undo();
          break;
        case 'redo':
          _redo();
          break;
        case 'find_replace':
          setState(() {
            _showFindReplace = !_showFindReplace;
          });
          break;
        case 'ai_menu':
          _showAIContextMenu();
          break;
        case 'tags':
          _showTagsDialog();
          break;
        case 'lock_note':
          _showSetPasswordDialog();
          break;
        case 'unlock_note':
          _showRemovePasswordDialog();
          break;
        case 'export_md':
          await _exportService.exportAsMarkdown(note, share: true);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Markdown exported')),
            );
          }
          break;
        case 'export_txt':
          await _exportService.exportAsPlainText(note, share: true);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Text exported')),
            );
          }
          break;
        case 'export_pdf':
          await _exportService.exportAsPDF(note, share: true);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('PDF exported')),
            );
          }
          break;
        case 'copy_md':
          await _exportService.copyToClipboard(note, asMarkdown: true);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Copied to clipboard (Markdown)')),
            );
          }
          break;
        case 'copy_txt':
          await _exportService.copyToClipboard(note, asMarkdown: false);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Copied to clipboard (Plain Text)')),
            );
          }
          break;
        case 'share':
          await _exportService.shareNote(note);
          break;
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Widget _buildEditor() {
    return TextField(
      controller: _contentController,
      maxLines: null,
      expands: true,
      decoration: const InputDecoration(
        hintText: 'Start writing your note...',
        border: InputBorder.none,
        contentPadding: EdgeInsets.all(16),
      ),
      style: const TextStyle(fontSize: 16),
      contextMenuBuilder: (context, editableTextState) {
        final List<ContextMenuButtonItem> buttonItems = editableTextState.contextMenuButtonItems;
        
        // Add AI button if text is selected
        buttonItems.add(
          ContextMenuButtonItem(
            label: '🤖 AI Actions',
            onPressed: () {
              ContextMenuController.removeAny();
              _showAIContextMenu();
            },
          ),
        );
        
        return AdaptiveTextSelectionToolbar.buttonItems(
          anchors: editableTextState.contextMenuAnchors,
          buttonItems: buttonItems,
        );
      },
    );
  }

  Widget _buildPreview() {
    final mediaStorageService = MediaStorageService();
    
    return Markdown(
      data: _contentController.text,
      selectable: true,
      styleSheet: MarkdownStyleSheet(
        p: const TextStyle(fontSize: 16),
        h1: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        h2: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        h3: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
      imageBuilder: (uri, title, alt) {
        // Handle custom cognotez-media URI scheme from desktop app
        if (uri.scheme == 'cognotez-media') {
          final mediaId = mediaStorageService.extractMediaId(uri.toString());
          if (mediaId != null) {
            return _MediaWidget(
              mediaId: mediaId,
              alt: alt,
              mediaStorageService: mediaStorageService,
            );
          }
          return _buildMediaPlaceholder(alt, 'Unknown media format');
        }
        
        // Handle regular file URIs
        if (uri.scheme == 'file') {
          try {
            return Image.file(
              File.fromUri(uri),
              errorBuilder: (context, error, stackTrace) => _buildImagePlaceholder(alt),
            );
          } catch (e) {
            return _buildImagePlaceholder(alt);
          }
        }
        
        // Handle network images
        if (uri.scheme == 'http' || uri.scheme == 'https') {
          return Image.network(
            uri.toString(),
            errorBuilder: (context, error, stackTrace) => _buildImagePlaceholder(alt),
          );
        }
        
        // Fallback for other schemes
        return _buildImagePlaceholder(alt);
      },
    );
  }

  Widget _buildImagePlaceholder(String? alt) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.broken_image, color: Colors.grey[600]),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              alt ?? 'Image not available',
              style: TextStyle(color: Colors.grey[600], fontStyle: FontStyle.italic),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaPlaceholder(String? alt, String message) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.image, color: Colors.grey[600]),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (alt != null && alt.isNotEmpty)
                  Text(
                    alt,
                    style: TextStyle(color: Colors.grey[700]),
                  ),
                Text(
                  message,
                  style: TextStyle(color: Colors.grey[500], fontStyle: FontStyle.italic, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    switch (_viewMode) {
      case ViewMode.edit:
        return _buildEditor();
      case ViewMode.preview:
        return _buildPreview();
      case ViewMode.split:
        return Row(
          children: [
            Expanded(child: _buildEditor()),
            const VerticalDivider(width: 1),
            Expanded(child: _buildPreview()),
          ],
        );
    }
  }

  IconData _getViewModeIcon() {
    switch (_viewMode) {
      case ViewMode.edit:
        return Icons.edit;
      case ViewMode.preview:
        return Icons.preview;
      case ViewMode.split:
        return Icons.vertical_split;
    }
  }

  void _cycleViewMode() {
    setState(() {
      switch (_viewMode) {
        case ViewMode.edit:
          _viewMode = ViewMode.preview;
          break;
        case ViewMode.preview:
          _viewMode = ViewMode.split;
          break;
        case ViewMode.split:
          _viewMode = ViewMode.edit;
          break;
      }
    });
  }

  String _getViewModeTooltip() {
    switch (_viewMode) {
      case ViewMode.edit:
        return 'Switch to Preview';
      case ViewMode.preview:
        return 'Switch to Split View';
      case ViewMode.split:
        return 'Switch to Edit';
    }
  }

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final canSave = _hasChanges || _isNew;
    
    return PopScope(
      // Let the system/back stack pop normally when there are no unsaved
      // changes. When there ARE unsaved changes, intercept back and route
      // through [_onWillPop] to show the confirmation dialog.
      canPop: !_hasChanges,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        // At this point we know there are unsaved changes; ask the user what
        // to do before actually popping.
        final shouldPop = await _onWillPop();
        if (shouldPop && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () {
              // Delegate to Navigator/pop stack; PopScope will intercept when
              // there are unsaved changes so behaviour stays consistent for
              // both app back and system back buttons.
              Navigator.maybePop(context);
            },
            tooltip: 'Back',
          ),
          title: TextField(
            controller: _titleController,
            decoration: const InputDecoration(
              hintText: 'Untitled note...',
              border: InputBorder.none,
            ),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          actions: [
            // View mode toggle
            IconButton(
              icon: Icon(_getViewModeIcon()),
              onPressed: _cycleViewMode,
              tooltip: _getViewModeTooltip(),
            ),
            // Save button
            IconButton(
              icon: Icon(
                Icons.check,
                color: canSave ? Theme.of(context).colorScheme.primary : null,
              ),
              onPressed: canSave ? _saveNote : null,
              tooltip: 'Save',
            ),
            // More options menu
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) => _handleMenuAction(value),
              itemBuilder: (context) => [
                // Edit tools (only in edit mode)
                if (_viewMode != ViewMode.preview) ...[
                  PopupMenuItem(
                    value: 'undo',
                    enabled: _canUndo,
                    child: const Row(
                      children: [
                        Icon(Icons.undo, size: 20),
                        SizedBox(width: 8),
                        Text('Undo'),
                      ],
                    ),
                  ),
                  PopupMenuItem(
                    value: 'redo',
                    enabled: _canRedo,
                    child: const Row(
                      children: [
                        Icon(Icons.redo, size: 20),
                        SizedBox(width: 8),
                        Text('Redo'),
                      ],
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'find_replace',
                    child: Row(
                      children: [
                        Icon(Icons.find_replace, size: 20),
                        SizedBox(width: 8),
                        Text('Find & Replace'),
                      ],
                    ),
                  ),
                  const PopupMenuDivider(),
                ],
                // AI Features
                PopupMenuItem(
                  value: 'ai_menu',
                  enabled: !_isAiLoading,
                  child: Row(
                    children: [
                      _isAiLoading 
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.smart_toy, size: 20),
                      const SizedBox(width: 8),
                      Text(_isAiLoading ? 'AI Processing...' : 'AI Features'),
                    ],
                  ),
                ),
                // Tags
                PopupMenuItem(
                  value: 'tags',
                  child: Row(
                    children: [
                      const Icon(Icons.label_outline, size: 20),
                      const SizedBox(width: 8),
                      Text('Tags${_currentNote.tags.isNotEmpty ? ' (${_currentNote.tags.length})' : ''}'),
                    ],
                  ),
                ),
                const PopupMenuDivider(),
                // Password protection
                if (!_currentNote.isPasswordProtected)
                  const PopupMenuItem(
                    value: 'lock_note',
                    child: Row(
                      children: [
                        Icon(Icons.lock, size: 20),
                        SizedBox(width: 8),
                        Text('Add Password'),
                      ],
                    ),
                  )
                else
                  const PopupMenuItem(
                    value: 'unlock_note',
                    child: Row(
                      children: [
                        Icon(Icons.lock_open, size: 20),
                        SizedBox(width: 8),
                        Text('Remove Password'),
                      ],
                    ),
                  ),
                const PopupMenuDivider(),
                // Export options
                const PopupMenuItem(
                  value: 'export_md',
                  child: Row(
                    children: [
                      Icon(Icons.file_download, size: 20),
                      SizedBox(width: 8),
                      Text('Export Markdown'),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'export_txt',
                  child: Row(
                    children: [
                      Icon(Icons.description, size: 20),
                      SizedBox(width: 8),
                      Text('Export Text'),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'export_pdf',
                  child: Row(
                    children: [
                      Icon(Icons.picture_as_pdf, size: 20),
                      SizedBox(width: 8),
                      Text('Export PDF'),
                    ],
                  ),
                ),
                const PopupMenuDivider(),
                const PopupMenuItem(
                  value: 'share',
                  child: Row(
                    children: [
                      Icon(Icons.share, size: 20),
                      SizedBox(width: 8),
                      Text('Share'),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
        body: Column(
          children: [
            // Find & Replace bar
            if (_showFindReplace)
              FindReplaceDialog(
                contentController: _contentController,
                onClose: () => setState(() => _showFindReplace = false),
                onReplace: (find, replace, {useRegex = false, caseSensitive = false, replaceAll = false}) {
                  // Handled internally by FindReplaceDialog
                },
              ),
            // Tag chips display
            if (_currentNote.tags.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: _currentNote.tags.map((tagId) {
                    final tag = notesService.tags.cast<Tag?>().firstWhere(
                      (t) => t?.id == tagId,
                      orElse: () => null,
                    );
                    return Chip(
                      label: Text(tag?.name ?? 'Unknown'),
                      deleteIcon: const Icon(Icons.close, size: 16),
                      onDeleted: () {
                        setState(() {
                          final newTags = List<String>.from(_currentNote.tags)..remove(tagId);
                          _currentNote = _currentNote.copyWith(tags: newTags);
                          _hasChanges = true;
                        });
                      },
                      visualDensity: VisualDensity.compact,
                    );
                  }).toList(),
                ),
              ),
            // Editor/Preview content
            Expanded(child: _buildContent()),
          ],
        ),
      ),
    );
  }
}

/// Widget that loads and displays media from MediaStorageService
class _MediaWidget extends StatefulWidget {
  final String mediaId;
  final String? alt;
  final MediaStorageService mediaStorageService;

  const _MediaWidget({
    required this.mediaId,
    this.alt,
    required this.mediaStorageService,
  });

  @override
  State<_MediaWidget> createState() => _MediaWidgetState();
}

class _MediaWidgetState extends State<_MediaWidget> {
  File? _mediaFile;
  bool _isLoading = true;
  String? _error;
  String? _mimeType;

  @override
  void initState() {
    super.initState();
    _loadMedia();
  }

  Future<void> _loadMedia() async {
    try {
      final file = await widget.mediaStorageService.getMediaFile(widget.mediaId);
      if (file != null && await file.exists()) {
        // Determine MIME type from file extension
        final extension = file.path.contains('.')
            ? file.path.substring(file.path.lastIndexOf('.'))
            : '';
        final mimeType = widget.mediaStorageService.getMimeTypeFromExtension(extension);
        
        if (mounted) {
          setState(() {
            _mediaFile = file;
            _mimeType = mimeType;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = 'Media not synced yet. Please sync to download.';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load media: $e';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 8),
            Text('Loading media...'),
          ],
        ),
      );
    }

    if (_error != null || _mediaFile == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.orange.shade300),
          borderRadius: BorderRadius.circular(8),
          color: Colors.orange.shade50,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_download, color: Colors.orange.shade700),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.alt != null && widget.alt!.isNotEmpty)
                    Text(
                      widget.alt!,
                      style: TextStyle(color: Colors.grey[700]),
                    ),
                  Text(
                    _error ?? 'Media not available',
                    style: TextStyle(
                      color: Colors.orange.shade700,
                      fontStyle: FontStyle.italic,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Display based on MIME type
    if (_mimeType != null && widget.mediaStorageService.isImageMimeType(_mimeType!)) {
      return GestureDetector(
        onTap: () => _showFullScreenImage(context),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(
              _mediaFile!,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) => _buildErrorWidget(),
            ),
          ),
        ),
      );
    } else if (_mimeType != null && widget.mediaStorageService.isVideoMimeType(_mimeType!)) {
      // Video player with chewie
      return GestureDetector(
        onTap: () => _showFullScreenVideo(context),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.blue.shade300),
            borderRadius: BorderRadius.circular(8),
            color: Colors.black,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Video thumbnail/preview
              Container(
                height: 200,
                decoration: BoxDecoration(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                  color: Colors.black,
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    const Icon(Icons.movie, color: Colors.white54, size: 64),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.play_arrow, color: Colors.white, size: 24),
                          SizedBox(width: 4),
                          Text('Tap to play', style: TextStyle(color: Colors.white)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Video info bar
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(8)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.video_file, color: Colors.blue.shade700, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.alt ?? _mediaFile!.path.split('/').last,
                        style: TextStyle(color: Colors.blue.shade700, fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    } else if (_mimeType != null && widget.mediaStorageService.isAudioMimeType(_mimeType!)) {
      // Audio placeholder
      return Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.purple.shade300),
          borderRadius: BorderRadius.circular(8),
          color: Colors.purple.shade50,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.audio_file, color: Colors.purple.shade700),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.alt != null && widget.alt!.isNotEmpty)
                    Text(widget.alt!, style: TextStyle(color: Colors.grey[700])),
                  Text(
                    'Audio file: ${_mediaFile!.path.split('/').last}',
                    style: TextStyle(color: Colors.purple.shade700, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Fallback for unknown media type
    return _buildErrorWidget();
  }

  Widget _buildErrorWidget() {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.broken_image, color: Colors.grey[600]),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              widget.alt ?? 'Media not available',
              style: TextStyle(color: Colors.grey[600], fontStyle: FontStyle.italic),
            ),
          ),
        ],
      ),
    );
  }

  void _showFullScreenImage(BuildContext context) {
    if (_mediaFile == null) return;
    
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            iconTheme: const IconThemeData(color: Colors.white),
          ),
          body: Center(
            child: InteractiveViewer(
              panEnabled: true,
              minScale: 0.5,
              maxScale: 4.0,
              child: Image.file(
                _mediaFile!,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showFullScreenVideo(BuildContext context) {
    if (_mediaFile == null) return;
    
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => _VideoPlayerScreen(videoFile: _mediaFile!),
      ),
    );
  }
}

/// Full screen video player screen
class _VideoPlayerScreen extends StatefulWidget {
  final File videoFile;

  const _VideoPlayerScreen({required this.videoFile});

  @override
  State<_VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<_VideoPlayerScreen> {
  late VideoPlayerController _videoController;
  ChewieController? _chewieController;
  bool _isInitialized = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializeVideo();
  }

  Future<void> _initializeVideo() async {
    try {
      _videoController = VideoPlayerController.file(widget.videoFile);
      await _videoController.initialize();
      
      _chewieController = ChewieController(
        videoPlayerController: _videoController,
        autoPlay: true,
        looping: false,
        aspectRatio: _videoController.value.aspectRatio,
        errorBuilder: (context, errorMessage) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error, color: Colors.red, size: 48),
                const SizedBox(height: 8),
                Text(
                  errorMessage,
                  style: const TextStyle(color: Colors.white),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        },
      );
      
      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load video: $e';
        });
      }
    }
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          widget.videoFile.path.split('/').last,
          style: const TextStyle(color: Colors.white, fontSize: 14),
        ),
      ),
      body: Center(
        child: _error != null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error, color: Colors.red, size: 48),
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                ],
              )
            : !_isInitialized
                ? const CircularProgressIndicator(color: Colors.white)
                : _chewieController != null
                    ? Chewie(controller: _chewieController!)
                    : const Text(
                        'Failed to initialize video player',
                        style: TextStyle(color: Colors.white),
                      ),
      ),
    );
  }
}
