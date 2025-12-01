import 'package:flutter/material.dart';

class FindReplaceDialog extends StatefulWidget {
  final TextEditingController contentController;
  final VoidCallback onClose;
  final Function(String, String, {bool useRegex, bool caseSensitive, bool replaceAll}) onReplace;

  const FindReplaceDialog({
    super.key,
    required this.contentController,
    required this.onClose,
    required this.onReplace,
  });

  @override
  State<FindReplaceDialog> createState() => _FindReplaceDialogState();
}

class _FindReplaceDialogState extends State<FindReplaceDialog> {
  final TextEditingController _findController = TextEditingController();
  final TextEditingController _replaceController = TextEditingController();
  bool _useRegex = false;
  bool _caseSensitive = false;
  int _matchCount = 0;
  int _currentMatchIndex = 0;
  List<Match> _matches = [];

  @override
  void initState() {
    super.initState();
    _findController.addListener(_updateMatches);
  }

  @override
  void dispose() {
    _findController.dispose();
    _replaceController.dispose();
    super.dispose();
  }

  void _updateMatches() {
    final searchText = _findController.text;
    if (searchText.isEmpty) {
      setState(() {
        _matchCount = 0;
        _currentMatchIndex = 0;
        _matches = [];
      });
      return;
    }

    try {
      RegExp regex;
      if (_useRegex) {
        regex = RegExp(searchText, caseSensitive: _caseSensitive);
      } else {
        regex = RegExp(
          RegExp.escape(searchText),
          caseSensitive: _caseSensitive,
        );
      }

      final content = widget.contentController.text;
      _matches = regex.allMatches(content).toList();
      
      setState(() {
        _matchCount = _matches.length;
        if (_currentMatchIndex >= _matchCount) {
          _currentMatchIndex = _matchCount > 0 ? 0 : 0;
        }
      });

      // Highlight current match by selecting it
      if (_matches.isNotEmpty && _currentMatchIndex < _matches.length) {
        final match = _matches[_currentMatchIndex];
        widget.contentController.selection = TextSelection(
          baseOffset: match.start,
          extentOffset: match.end,
        );
      }
    } catch (e) {
      // Invalid regex
      setState(() {
        _matchCount = 0;
        _currentMatchIndex = 0;
        _matches = [];
      });
    }
  }

  void _findNext() {
    if (_matches.isEmpty) return;
    setState(() {
      _currentMatchIndex = (_currentMatchIndex + 1) % _matches.length;
    });
    _highlightCurrentMatch();
  }

  void _findPrevious() {
    if (_matches.isEmpty) return;
    setState(() {
      _currentMatchIndex = (_currentMatchIndex - 1 + _matches.length) % _matches.length;
    });
    _highlightCurrentMatch();
  }

  void _highlightCurrentMatch() {
    if (_matches.isNotEmpty && _currentMatchIndex < _matches.length) {
      final match = _matches[_currentMatchIndex];
      widget.contentController.selection = TextSelection(
        baseOffset: match.start,
        extentOffset: match.end,
      );
    }
  }

  void _replaceCurrent() {
    if (_matches.isEmpty || _currentMatchIndex >= _matches.length) return;
    
    final match = _matches[_currentMatchIndex];
    final content = widget.contentController.text;
    String replacement = _replaceController.text;
    
    // For regex mode, support group references like $1, $2, etc.
    if (_useRegex) {
      replacement = content.substring(match.start, match.end).replaceFirstMapped(
        RegExp(_findController.text, caseSensitive: _caseSensitive),
        (m) => _replaceController.text.replaceAllMapped(
          RegExp(r'\$(\d+)'),
          (ref) {
            final groupIndex = int.parse(ref.group(1)!);
            return groupIndex < m.groupCount + 1 ? m.group(groupIndex) ?? '' : ref.group(0)!;
          },
        ),
      );
    }
    
    final newContent = content.substring(0, match.start) + 
                       replacement + 
                       content.substring(match.end);
    
    widget.contentController.text = newContent;
    widget.contentController.selection = TextSelection.collapsed(
      offset: match.start + replacement.length,
    );
    
    _updateMatches();
  }

  void _replaceAll() {
    final searchText = _findController.text;
    if (searchText.isEmpty) return;

    try {
      RegExp regex;
      if (_useRegex) {
        regex = RegExp(searchText, caseSensitive: _caseSensitive);
      } else {
        regex = RegExp(
          RegExp.escape(searchText),
          caseSensitive: _caseSensitive,
        );
      }

      String newContent;
      if (_useRegex) {
        newContent = widget.contentController.text.replaceAllMapped(regex, (match) {
          return _replaceController.text.replaceAllMapped(
            RegExp(r'\$(\d+)'),
            (ref) {
              final groupIndex = int.parse(ref.group(1)!);
              return groupIndex < match.groupCount + 1 ? match.group(groupIndex) ?? '' : ref.group(0)!;
            },
          );
        });
      } else {
        newContent = widget.contentController.text.replaceAll(regex, _replaceController.text);
      }

      widget.contentController.text = newContent;
      _updateMatches();
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Replaced $_matchCount occurrences')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Invalid regex: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Find row
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _findController,
                  decoration: InputDecoration(
                    hintText: 'Find...',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    suffixText: _matchCount > 0 
                        ? '${_currentMatchIndex + 1}/$_matchCount' 
                        : _findController.text.isNotEmpty ? '0/0' : null,
                  ),
                  autofocus: true,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.arrow_upward, size: 20),
                onPressed: _findPrevious,
                tooltip: 'Previous match',
                visualDensity: VisualDensity.compact,
              ),
              IconButton(
                icon: const Icon(Icons.arrow_downward, size: 20),
                onPressed: _findNext,
                tooltip: 'Next match',
                visualDensity: VisualDensity.compact,
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: widget.onClose,
                tooltip: 'Close',
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Replace row
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _replaceController,
                  decoration: InputDecoration(
                    hintText: 'Replace with...',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: _replaceCurrent,
                child: const Text('Replace'),
              ),
              TextButton(
                onPressed: _replaceAll,
                child: const Text('All'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Options row
          Row(
            children: [
              FilterChip(
                label: const Text('Regex'),
                selected: _useRegex,
                onSelected: (value) {
                  setState(() {
                    _useRegex = value;
                  });
                  _updateMatches();
                },
                visualDensity: VisualDensity.compact,
              ),
              const SizedBox(width: 8),
              FilterChip(
                label: const Text('Match case'),
                selected: _caseSensitive,
                onSelected: (value) {
                  setState(() {
                    _caseSensitive = value;
                  });
                  _updateMatches();
                },
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
