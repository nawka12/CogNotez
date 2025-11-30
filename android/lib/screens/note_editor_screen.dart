import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../models/note.dart';
import '../services/notes_service.dart';
import '../services/export_service.dart';

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

class _NoteEditorScreenState extends State<NoteEditorScreen> {
  late TextEditingController _titleController;
  late TextEditingController _contentController;
  bool _isPreview = false;
  bool _hasChanges = false;
  final ExportService _exportService = ExportService();
  
  // Undo/Redo history
  final List<_EditorState> _history = [];
  int _historyIndex = -1;
  static const int _maxHistorySize = 50;
  bool _isRecordingHistory = true;
  DateTime? _lastSaveTime;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.note.title);
    _contentController = TextEditingController(text: widget.note.content);
    _titleController.addListener(_onChanged);
    _contentController.addListener(_onChanged);
    _saveState();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (!_hasChanges) {
      setState(() {
        _hasChanges = true;
      });
    }
    // Save state after a delay to avoid too many history entries
    _lastSaveTime = DateTime.now();
    Future.delayed(const Duration(milliseconds: 1000), () {
      if (_isRecordingHistory && 
          mounted && 
          _lastSaveTime != null &&
          DateTime.now().difference(_lastSaveTime!).inMilliseconds >= 1000) {
        _saveState();
      }
    });
  }
  
  void _saveState() {
    if (!_isRecordingHistory) return;
    
    final state = _EditorState(
      title: _titleController.text,
      content: _contentController.text,
    );
    
    // Remove any states after current index (if we've undone and made new changes)
    if (_historyIndex < _history.length - 1) {
      _history.removeRange(_historyIndex + 1, _history.length);
    }
    
    // Only save if different from last state
    if (_history.isEmpty || 
        (_historyIndex >= 0 && _history[_historyIndex] != state)) {
      _history.add(state);
      _historyIndex = _history.length - 1;
      
      // Limit history size
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

  Future<void> _saveNote() async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final updatedNote = widget.note.copyWith(
      title: _titleController.text,
      content: _contentController.text,
      updatedAt: DateTime.now(),
    );

    if (widget.isNew) {
      await notesService.createNote(updatedNote);
    } else {
      await notesService.updateNote(updatedNote);
    }

    setState(() {
      _hasChanges = false;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Note saved')),
      );
    }
  }

  Note _getCurrentNote() {
    return widget.note.copyWith(
      title: _titleController.text,
      content: _contentController.text,
    );
  }

  Future<void> _handleMenuAction(String action) async {
    final note = _getCurrentNote();
    
    try {
      switch (action) {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _titleController,
          decoration: const InputDecoration(
            hintText: 'Untitled note...',
            border: InputBorder.none,
          ),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        actions: [
          if (!_isPreview) ...[
            IconButton(
              icon: const Icon(Icons.undo),
              onPressed: _canUndo ? _undo : null,
              tooltip: 'Undo',
            ),
            IconButton(
              icon: const Icon(Icons.redo),
              onPressed: _canRedo ? _redo : null,
              tooltip: 'Redo',
            ),
          ],
          IconButton(
            icon: Icon(_isPreview ? Icons.edit : Icons.preview),
            onPressed: () {
              setState(() {
                _isPreview = !_isPreview;
              });
            },
            tooltip: _isPreview ? 'Edit' : 'Preview',
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) => _handleMenuAction(value),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'export_md',
                child: Row(
                  children: [
                    Icon(Icons.file_download, size: 20),
                    SizedBox(width: 8),
                    Text('Export as Markdown'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'export_txt',
                child: Row(
                  children: [
                    Icon(Icons.description, size: 20),
                    SizedBox(width: 8),
                    Text('Export as Plain Text'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'export_pdf',
                child: Row(
                  children: [
                    Icon(Icons.picture_as_pdf, size: 20),
                    SizedBox(width: 8),
                    Text('Export as PDF'),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'copy_md',
                child: Row(
                  children: [
                    Icon(Icons.copy, size: 20),
                    SizedBox(width: 8),
                    Text('Copy as Markdown'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'copy_txt',
                child: Row(
                  children: [
                    Icon(Icons.content_copy, size: 20),
                    SizedBox(width: 8),
                    Text('Copy as Plain Text'),
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
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: _hasChanges ? _saveNote : null,
            tooltip: 'Save',
          ),
        ],
      ),
      body: _isPreview
          ? Markdown(
              data: _contentController.text,
              styleSheet: MarkdownStyleSheet(
                p: const TextStyle(fontSize: 16),
                h1: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                h2: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                h3: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            )
          : TextField(
              controller: _contentController,
              maxLines: null,
              expands: true,
              decoration: const InputDecoration(
                hintText: 'Start writing your note...',
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
              style: const TextStyle(fontSize: 16),
            ),
    );
  }
}

