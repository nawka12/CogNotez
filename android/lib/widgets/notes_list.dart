import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/note.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../utils/date_formatter.dart';

class NotesList extends StatelessWidget {
  final List<Note>? notes;
  final void Function(Note note)? onNoteSelected;
  final VoidCallback? onCreateNote;
  final void Function(Note note)? onNoteDuplicated;

  const NotesList({
    super.key,
    this.notes,
    this.onNoteSelected,
    this.onCreateNote,
    this.onNoteDuplicated,
  });

  @override
  Widget build(BuildContext context) {
    return Consumer<NotesService>(
      builder: (context, notesService, _) {
        final displayNotes = notes ?? notesService.notes;
        
        if (displayNotes.isEmpty) {
          return _buildEmptyState(context, notesService);
        }

        return RefreshIndicator(
          onRefresh: () async {
            await notesService.loadNotes();
          },
          child: ListView.builder(
            itemCount: displayNotes.length,
            itemBuilder: (context, index) {
              final note = displayNotes[index];
              return _NoteListItem(
                note: note,
                onTap: onNoteSelected,
                onNoteDuplicated: onNoteDuplicated,
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildEmptyState(BuildContext context, NotesService notesService) {
    final selectedFolder = notesService.selectedFolder;
    final searchQuery = notesService.searchQuery;
    
    String title;
    String message;
    IconData icon;
    
    if (searchQuery.isNotEmpty || (notes != null && notesService.notes.isNotEmpty)) {
      title = 'No notes found';
      message = 'No notes match your filters';
      icon = Icons.search_off;
    } else if (selectedFolder == 'all') {
      if (notesService.allNotes.isEmpty) {
        title = 'No notes yet';
        message = 'Create your first note to get started';
        icon = Icons.note_add_outlined;
      } else {
        title = 'No notes';
        message = 'No notes to display';
        icon = Icons.note_add_outlined;
      }
    } else if (selectedFolder == 'untagged') {
      title = 'No untagged notes';
      message = 'All your notes have tags';
      icon = Icons.description_outlined;
    } else {
      final tag = notesService.tags.cast<Tag?>().firstWhere(
        (t) => t?.id == selectedFolder,
        orElse: () => null,
      );
      if (tag != null) {
        title = 'No notes with this tag';
        message = 'No notes are tagged with "${tag.name}"';
        icon = Icons.label_outline;
      } else {
        title = 'No notes';
        message = 'No notes found for this folder';
        icon = Icons.folder_outlined;
      }
    }
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 96,
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey[500],
              ),
            ),
            if (notesService.allNotes.isEmpty && onCreateNote != null) ...[
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: onCreateNote,
                icon: const Icon(Icons.add),
                label: const Text('Create Note'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NoteListItem extends StatelessWidget {
  final Note note;
  final void Function(Note note)? onTap;
  final void Function(Note note)? onNoteDuplicated;

  const _NoteListItem({
    required this.note,
    this.onTap,
    this.onNoteDuplicated,
  });

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context, listen: false);
    
    // For locked notes, show different preview
    final isLocked = note.isPasswordProtected && note.encryptedContent != null;
    final preview = isLocked
        ? '🔒 This note is password protected'
        : note.content.length > 100
            ? '${note.content.substring(0, 100)}...'
            : note.content;

    // Convert tag IDs to tag names
    List<String> tagNames = [];
    for (final tagId in note.tags) {
      final tag = notesService.tags.cast<Tag?>().firstWhere(
        (t) => t?.id == tagId,
        orElse: () => null,
      );
      if (tag != null) {
        tagNames.add(tag.name);
      }
    }

    return Dismissible(
      key: Key(note.id),
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      secondaryBackground: Container(
        color: Theme.of(context).colorScheme.primary,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: Icon(
          note.isPinned ? Icons.push_pin_outlined : Icons.push_pin,
          color: Colors.white,
        ),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          final result = await _showDeleteDialog(context);
          if (result == true) {
            return true;
          }
          return false;
        } else {
          // Swipe right to toggle pin
          await _togglePin(context);
          return false;
        }
      },
      onDismissed: (direction) {},
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: InkWell(
          onTap: () {
            if (onTap != null) {
              onTap!(note);
            }
          },
          onLongPress: () => _showContextMenu(context),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Leading icon
                _buildLeadingIcon(context, isLocked),
                const SizedBox(width: 12),
                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title row with pin indicator
                      Row(
                        children: [
                          if (note.isPinned) ...[
                            Icon(
                              Icons.push_pin,
                              size: 14,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                            const SizedBox(width: 4),
                          ],
                          Expanded(
                            child: Text(
                              note.title.isEmpty ? 'Untitled' : note.title,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 16,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        preview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isLocked ? Colors.grey[500] : Colors.grey[600],
                          fontSize: 14,
                          fontStyle: isLocked ? FontStyle.italic : FontStyle.normal,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(
                            Icons.access_time,
                            size: 12,
                            color: Colors.grey[500],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            DateFormatter.format(note.updatedAt),
                            style: TextStyle(
                              color: Colors.grey[500],
                              fontSize: 12,
                            ),
                          ),
                          if (note.wordCount > 0 && !isLocked) ...[
                            const SizedBox(width: 12),
                            Icon(
                              Icons.text_fields,
                              size: 12,
                              color: Colors.grey[500],
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${note.wordCount} words',
                              style: TextStyle(
                                color: Colors.grey[500],
                                fontSize: 12,
                              ),
                            ),
                          ],
                          if (tagNames.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            Expanded(
                              child: Wrap(
                                spacing: 4,
                                runSpacing: 4,
                                children: tagNames.take(3).map((tagName) {
                                  return Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Theme.of(context).colorScheme.primaryContainer,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      tagName,
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLeadingIcon(BuildContext context, bool isLocked) {
    if (note.isPasswordProtected) {
      return Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          isLocked ? Icons.lock : Icons.lock_open,
          color: Theme.of(context).colorScheme.onPrimaryContainer,
          size: 20,
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Future<void> _showContextMenu(BuildContext context) async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final canPin = notesService.canPinNote();
    
    final result = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.open_in_new),
              title: const Text('Open'),
              onTap: () => Navigator.pop(context, 'open'),
            ),
            ListTile(
              leading: Icon(note.isPinned ? Icons.push_pin_outlined : Icons.push_pin),
              title: Text(note.isPinned ? 'Unpin' : 'Pin'),
              subtitle: !note.isPinned && !canPin
                  ? const Text('Maximum 3 pinned notes', style: TextStyle(color: Colors.orange))
                  : null,
              enabled: note.isPinned || canPin,
              onTap: () => Navigator.pop(context, 'pin'),
            ),
            ListTile(
              leading: const Icon(Icons.copy),
              title: const Text('Duplicate'),
              onTap: () => Navigator.pop(context, 'duplicate'),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.delete, color: Colors.red),
              title: const Text('Delete', style: TextStyle(color: Colors.red)),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (result == null || !context.mounted) return;

    switch (result) {
      case 'open':
        if (onTap != null) {
          onTap!(note);
        }
        break;
      case 'pin':
        await _togglePin(context);
        break;
      case 'duplicate':
        await _duplicateNote(context);
        break;
      case 'delete':
        await _showDeleteDialog(context);
        break;
    }
  }

  Future<void> _togglePin(BuildContext context) async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    final success = await notesService.togglePinNote(note.id);
    
    if (!success && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cannot pin more than 3 notes'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(note.isPinned ? 'Note unpinned' : 'Note pinned'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 1),
        ),
      );
    }
  }

  Future<void> _duplicateNote(BuildContext context) async {
    final notesService = Provider.of<NotesService>(context, listen: false);
    try {
      final duplicated = await notesService.duplicateNote(note.id);
      if (duplicated != null && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Note duplicated'),
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 1),
          ),
        );
        // Optionally open the duplicated note
        if (onNoteDuplicated != null) {
          onNoteDuplicated!(duplicated);
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to duplicate note: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<bool> _showDeleteDialog(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Note'),
        content: Text(
          'Are you sure you want to delete "${note.title.isEmpty ? "Untitled" : note.title}"?\n\nThis action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    
    if (result == true && context.mounted) {
      final notesService = Provider.of<NotesService>(context, listen: false);
      await notesService.deleteNote(note.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Note deleted'),
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 1),
          ),
        );
      }
      return true;
    }
    
    return false;
  }
}
