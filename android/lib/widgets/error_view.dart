import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';

/// Types of errors that can be displayed
enum ErrorType {
  network,
  loading,
  saving,
  unknown,
}

/// A widget that displays an error message with retry functionality
class ErrorView extends StatelessWidget {
  final String? message;
  final ErrorType errorType;
  final VoidCallback? onRetry;
  final bool compact;

  const ErrorView({
    super.key,
    this.message,
    this.errorType = ErrorType.unknown,
    this.onRetry,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    final errorMessage = message ?? _getDefaultMessage(loc, errorType);
    final icon = _getIcon(errorType);

    if (compact) {
      return _buildCompact(context, errorMessage, icon, colorScheme, loc);
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Error icon with animation
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.0, end: 1.0),
              duration: const Duration(milliseconds: 600),
              curve: Curves.elasticOut,
              builder: (context, value, child) {
                return Transform.scale(
                  scale: value,
                  child: child,
                );
              },
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colorScheme.errorContainer,
                ),
                child: Icon(
                  icon,
                  size: 40,
                  color: colorScheme.onErrorContainer,
                ),
              ),
            ),
            const SizedBox(height: 24),
            // Error title
            Text(
              loc?.error_occurred ?? 'An error occurred',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            // Error message
            Text(
              errorMessage,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: colorScheme.onSurfaceVariant,
              ),
            ),
            // Retry button
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: Text(loc?.retry ?? 'Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCompact(
    BuildContext context,
    String message,
    IconData icon,
    ColorScheme colorScheme,
    AppLocalizations? loc,
  ) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: colorScheme.onErrorContainer),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: colorScheme.onErrorContainer,
                fontSize: 14,
              ),
            ),
          ),
          if (onRetry != null)
            IconButton(
              onPressed: onRetry,
              icon: Icon(Icons.refresh, color: colorScheme.onErrorContainer),
              tooltip: loc?.retry ?? 'Retry',
            ),
        ],
      ),
    );
  }

  String _getDefaultMessage(AppLocalizations? loc, ErrorType type) {
    switch (type) {
      case ErrorType.network:
        return loc?.error_network ?? 'Network error. Please check your connection.';
      case ErrorType.loading:
        return loc?.error_loading_notes ?? 'Failed to load notes';
      case ErrorType.saving:
        return loc?.error_saving_note ?? 'Failed to save note';
      case ErrorType.unknown:
        return loc?.error_unknown ?? 'Something went wrong. Please try again.';
    }
  }

  IconData _getIcon(ErrorType type) {
    switch (type) {
      case ErrorType.network:
        return Icons.wifi_off;
      case ErrorType.loading:
        return Icons.cloud_off;
      case ErrorType.saving:
        return Icons.save_outlined;
      case ErrorType.unknown:
        return Icons.error_outline;
    }
  }
}

/// A banner that shows at the top of the screen for transient errors
class ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback? onDismiss;
  final VoidCallback? onRetry;

  const ErrorBanner({
    super.key,
    required this.message,
    this.onDismiss,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      color: colorScheme.errorContainer,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(
                Icons.error_outline,
                color: colorScheme.onErrorContainer,
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  message,
                  style: TextStyle(
                    color: colorScheme.onErrorContainer,
                    fontSize: 13,
                  ),
                ),
              ),
              if (onRetry != null)
                TextButton(
                  onPressed: onRetry,
                  child: Text(
                    'Retry',
                    style: TextStyle(color: colorScheme.onErrorContainer),
                  ),
                ),
              if (onDismiss != null)
                IconButton(
                  onPressed: onDismiss,
                  icon: Icon(
                    Icons.close,
                    size: 18,
                    color: colorScheme.onErrorContainer,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shows a snackbar with error styling
void showErrorSnackBar(BuildContext context, String message, {VoidCallback? onRetry}) {
  final loc = AppLocalizations.of(context);
  
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.white),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
      backgroundColor: Theme.of(context).colorScheme.error,
      behavior: SnackBarBehavior.floating,
      action: onRetry != null
          ? SnackBarAction(
              label: loc?.retry ?? 'Retry',
              textColor: Colors.white,
              onPressed: onRetry,
            )
          : null,
    ),
  );
}
