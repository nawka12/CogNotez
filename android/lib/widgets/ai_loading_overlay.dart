import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';

/// A loading overlay displayed when AI is processing
class AILoadingOverlay extends StatefulWidget {
  final String? message;
  final VoidCallback? onCancel;
  final bool showCancel;

  const AILoadingOverlay({
    super.key,
    this.message,
    this.onCancel,
    this.showCancel = true,
  });

  @override
  State<AILoadingOverlay> createState() => _AILoadingOverlayState();
}

class _AILoadingOverlayState extends State<AILoadingOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _pulseAnimation;
  late Animation<double> _rotationAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.2).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
    );

    _rotationAnimation = Tween<double>(begin: 0, end: 1).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      color: Colors.black54,
      child: Center(
        child: Card(
          elevation: 8,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Container(
            padding: const EdgeInsets.all(32),
            constraints: const BoxConstraints(maxWidth: 280),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Animated AI icon
                AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _pulseAnimation.value,
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [
                              colorScheme.primary,
                              colorScheme.secondary,
                            ],
                            transform: GradientRotation(
                              _rotationAnimation.value * 6.28,
                            ),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: colorScheme.primary.withOpacity(0.4),
                              blurRadius: 20,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.smart_toy,
                          size: 40,
                          color: colorScheme.onPrimary,
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 24),
                // Loading text
                Text(
                  widget.message ?? loc?.ai_processing ?? 'AI is thinking...',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                // Animated dots
                _AnimatedDots(color: colorScheme.primary),
                // Cancel button
                if (widget.showCancel && widget.onCancel != null) ...[
                  const SizedBox(height: 24),
                  TextButton(
                    onPressed: widget.onCancel,
                    child: Text(loc?.cancel ?? 'Cancel'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AnimatedDots extends StatefulWidget {
  final Color color;

  const _AnimatedDots({required this.color});

  @override
  State<_AnimatedDots> createState() => _AnimatedDotsState();
}

class _AnimatedDotsState extends State<_AnimatedDots>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final delay = index * 0.2;
            final progress =
                ((_controller.value - delay) % 1.0).clamp(0.0, 1.0);
            final opacity = (progress < 0.5)
                ? (progress * 2).clamp(0.3, 1.0)
                : ((1 - progress) * 2).clamp(0.3, 1.0);

            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.color.withOpacity(opacity),
              ),
            );
          }),
        );
      },
    );
  }
}

/// Shows the AI loading overlay
void showAILoadingOverlay(BuildContext context, {String? message}) {
  showDialog(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.transparent,
    builder: (context) => AILoadingOverlay(
      message: message,
      showCancel: false,
    ),
  );
}

/// Hides the AI loading overlay
void hideAILoadingOverlay(BuildContext context) {
  Navigator.of(context, rootNavigator: true).pop();
}

/// A mixin for StatefulWidgets that need AI loading functionality
mixin AILoadingMixin<T extends StatefulWidget> on State<T> {
  bool _isAILoading = false;

  bool get isAILoading => _isAILoading;

  /// Execute an AI operation with loading overlay
  Future<R?> withAILoading<R>(
    Future<R> Function() operation, {
    String? loadingMessage,
    bool showOverlay = true,
  }) async {
    if (_isAILoading) return null;

    setState(() {
      _isAILoading = true;
    });

    if (showOverlay && mounted) {
      showAILoadingOverlay(context, message: loadingMessage);
    }

    try {
      final result = await operation();
      return result;
    } finally {
      if (mounted) {
        if (showOverlay) {
          hideAILoadingOverlay(context);
        }
        setState(() {
          _isAILoading = false;
        });
      }
    }
  }
}
