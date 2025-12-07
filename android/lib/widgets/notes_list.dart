import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/note.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../utils/date_formatter.dart';
import '../utils/app_theme.dart';
import 'styled_dialog.dart';

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

    if (searchQuery.isNotEmpty ||
        (notes != null && notesService.notes.isNotEmpty)) {
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
        padding: const EdgeInsets.all(AppTheme.spacing2Xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Animated icon with gradient
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.accentColor, AppTheme.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(AppTheme.radiusFull),
                boxShadow: [AppTheme.shadowAccent],
              ),
              child: Icon(
                icon,
                size: 40,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: AppTheme.spacingLg),
            Text(
              title,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: AppTheme.spacingSm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            if (notesService.allNotes.isEmpty && onCreateNote != null) ...[
              const SizedBox(height: AppTheme.spacing2Xl),
              ElevatedButton.icon(
                onPressed: onCreateNote,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentColor,
                  foregroundColor: Colors.white,
                  padding: EdgeInsets.symmetric(
                      horizontal: AppTheme.spacingLg,
                      vertical: AppTheme.spacingSm),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusFull),
                  ),
                  elevation: 2,
                  shadowColor: AppTheme.accentLight,
                ),
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
      child: Container(
        margin: const EdgeInsets.symmetric(
            horizontal: AppTheme.spacingSm, vertical: AppTheme.spacingXs),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: Border.all(
            color: note.isPinned
                ? AppTheme.accentColor.withOpacity(0.3)
                : Theme.of(context).colorScheme.outline,
            width: note.isPinned ? 1.5 : 1.0,
          ),
          boxShadow: [AppTheme.shadowXs],
          // Add subtle gradient for pinned notes
          gradient: note.isPinned
              ? LinearGradient(
                  colors: [AppTheme.accentLightest, Colors.transparent],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              if (onTap != null) {
                onTap!(note);
              }
            },
            onLongPress: () => _showContextMenu(context),
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            child: Padding(
              padding: const EdgeInsets.all(AppTheme.spacingMd),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Leading icon
                  _buildLeadingIcon(context, isLocked),
                  const SizedBox(width: AppTheme.spacingSm),
                  // Content
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Title row with pin indicator
                        Row(
                          children: [
                            if (note.isPinned) ...[
                              Container(
                                padding:
                                    const EdgeInsets.all(AppTheme.spacingXs),
                                decoration: BoxDecoration(
                                  color: AppTheme.accentLight,
                                  borderRadius:
                                      BorderRadius.circular(AppTheme.radiusSm),
                                  border:
                                      Border.all(color: AppTheme.accentColor),
                                ),
                                child: Icon(
                                  Icons.push_pin,
                                  size: 12,
                                  color: AppTheme.accentColor,
                                ),
                              ),
                              const SizedBox(width: AppTheme.spacingXs),
                            ],
                            Expanded(
                              child: Text(
                                note.title.isEmpty ? 'Untitled' : note.title,
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 16,
                                  color:
                                      Theme.of(context).colorScheme.onSurface,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingXs),
                        Text(
                          preview,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: isLocked
                                ? Theme.of(context).colorScheme.onSurfaceVariant
                                : Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                            fontSize: 14,
                            fontStyle:
                                isLocked ? FontStyle.italic : FontStyle.normal,
                          ),
                        ),
                        const SizedBox(height: AppTheme.spacingSm),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: AppTheme.spacingXs,
                                  vertical: AppTheme.spacingXs),
                              decoration: BoxDecoration(
                                color: Theme.of(context)
                                    .colorScheme
                                    .surfaceVariant,
                                borderRadius:
                                    BorderRadius.circular(AppTheme.radiusMd),
                                border: Border.all(
                                    color:
                                        Theme.of(context).colorScheme.outline),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.access_time,
                                    size: 12,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                                  const SizedBox(width: AppTheme.spacingXs),
                                  Text(
                                    DateFormatter.format(note.updatedAt),
                                    style: TextStyle(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (note.wordCount > 0 && !isLocked) ...[
                              const SizedBox(width: AppTheme.spacingSm),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: AppTheme.spacingXs,
                                    vertical: AppTheme.spacingXs),
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceVariant,
                                  borderRadius:
                                      BorderRadius.circular(AppTheme.radiusMd),
                                  border: Border.all(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .outline),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.text_fields,
                                      size: 12,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                    ),
                                    const SizedBox(width: AppTheme.spacingXs),
                                    Text(
                                      '${note.wordCount} words',
                                      style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            if (tagNames.isNotEmpty) ...[
                              const SizedBox(width: AppTheme.spacingSm),
                              Expanded(
                                child: Wrap(
                                  spacing: AppTheme.spacingXs,
                                  runSpacing: AppTheme.spacingXs,
                                  children: tagNames.take(3).map((tagName) {
                                    return Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: AppTheme.spacingXs,
                                          vertical: AppTheme.spacingXs),
                                      decoration: BoxDecoration(
                                        color: AppTheme.accentLighter,
                                        borderRadius: BorderRadius.circular(
                                            AppTheme.radiusFull),
                                        border: Border.all(
                                            color: AppTheme.accentColor),
                                      ),
                                      child: Text(
                                        tagName,
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: AppTheme.accentColor,
                                          fontWeight: FontWeight.w500,
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
      ),
    );
  }

  Widget _buildLeadingIcon(BuildContext context, bool isLocked) {
    if (note.isPasswordProtected) {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.accentColor, AppTheme.primaryDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        ),
        child: Icon(
          isLocked ? Icons.lock : Icons.lock_open,
          color: Colors.white,
          size: 16,
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
              leading: Icon(
                  note.isPinned ? Icons.push_pin_outlined : Icons.push_pin),
              title: Text(note.isPinned ? 'Unpin' : 'Pin'),
              subtitle: !note.isPinned && !canPin
                  ? const Text('Maximum 3 pinned notes',
                      style: TextStyle(color: Colors.orange))
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
      builder: (context) => StyledDialog(
        title: 'Delete Note',
        message:
            'Are you sure you want to delete "${note.title.isEmpty ? "Untitled" : note.title}"?\n\nThis action cannot be undone.',
        isDestructive: true,
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
