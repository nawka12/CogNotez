import 'package:flutter/material.dart';

/// A unified, premium styled dialog for the application.
class StyledDialog extends StatelessWidget {
  final String title;
  final Widget? content;
  final String? message; // Helper for simple text content
  final List<Widget>? actions;
  final bool isDestructive; // Defines if the primary action is destructive

  const StyledDialog({
    super.key,
    required this.title,
    this.content,
    this.message,
    this.actions,
    this.isDestructive = false,
  }) : assert(content != null || message != null,
            'Either content or message must be provided');

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      elevation: 0,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 32,
              offset: Offset(0, 16),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                textAlign: TextAlign.center,
              ),
            ),

            // Content
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: content ??
                  Text(
                    message!,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          height: 1.5,
                        ),
                    textAlign: TextAlign.center,
                  ),
            ),

            const SizedBox(height: 24),

            // Actions
            if (actions != null && actions!.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withOpacity(0.3),
                  borderRadius:
                      const BorderRadius.vertical(bottom: Radius.circular(28)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: _buildActions(context),
                ),
              )
            else
              const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildActions(BuildContext context) {
    // Space out actions
    final spacedActions = <Widget>[];
    for (var i = 0; i < actions!.length; i++) {
      if (i > 0) spacedActions.add(const SizedBox(width: 8));
      spacedActions.add(actions![i]);
    }
    return spacedActions;
  }
}
