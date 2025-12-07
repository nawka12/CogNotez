import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/ai_service.dart';
import '../services/settings_service.dart';
import '../models/settings.dart';
import '../l10n/app_localizations.dart';

/// Represents a message in the AI conversation
class AIMessage {
  final String content;
  final bool isUser;
  final DateTime timestamp;
  final bool isError;

  AIMessage({
    required this.content,
    required this.isUser,
    DateTime? timestamp,
    this.isError = false,
  }) : timestamp = timestamp ?? DateTime.now();
}

/// AI Conversation Panel - A chat interface for conversing with AI
class AIConversationPanel extends StatefulWidget {
  final String? noteContext;
  final String? selectedText;
  final VoidCallback? onClose;

  const AIConversationPanel({
    super.key,
    this.noteContext,
    this.selectedText,
    this.onClose,
  });

  @override
  State<AIConversationPanel> createState() => _AIConversationPanelState();
}

class _AIConversationPanelState extends State<AIConversationPanel> {
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _inputFocusNode = FocusNode();
  final List<AIMessage> _messages = [];
  bool _isLoading = false;
  bool _isAIConfigured = false;
  bool _welcomeMessageAdded = false;

  @override
  void initState() {
    super.initState();
    _checkAIConfiguration();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Add welcome message only once, after context is available
    if (!_welcomeMessageAdded) {
      _welcomeMessageAdded = true;
      _addWelcomeMessage();
    }
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _inputFocusNode.dispose();
    super.dispose();
  }

  void _checkAIConfiguration() {
    final settingsService = SettingsService();
    settingsService.loadSettings().then((_) {
      final settings = settingsService.settings;
      setState(() {
        _isAIConfigured = _isConfigured(settings);
      });
    });
  }

  bool _isConfigured(AppSettings settings) {
    if (settings.aiBackend == 'ollama') {
      return settings.ollamaEndpoint.isNotEmpty &&
          settings.ollamaModel.isNotEmpty;
    } else if (settings.aiBackend == 'openrouter') {
      return settings.openRouterApiKey != null &&
          settings.openRouterApiKey!.isNotEmpty &&
          settings.openRouterModel != null &&
          settings.openRouterModel!.isNotEmpty;
    }
    return false;
  }

  void _addWelcomeMessage() {
    final loc = AppLocalizations.of(context);
    setState(() {
      _messages.add(AIMessage(
        content: loc?.ai_welcome_message ??
            "Hello! I'm your AI assistant. I can help you with your notes - ask me questions, get summaries, or just chat about anything!",
        isUser: false,
      ));
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _isLoading) return;

    // Add user message
    setState(() {
      _messages.add(AIMessage(content: text, isUser: true));
      _inputController.clear();
      _isLoading = true;
    });
    _scrollToBottom();

    try {
      final settingsService = SettingsService();
      await settingsService.loadSettings();
      final settings = settingsService.settings;

      if (!_isConfigured(settings)) {
        throw Exception('AI is not configured. Please set up AI in Settings.');
      }

      final aiService = AIService(settings);

      // Build context from note and selected text
      String? context;
      if (widget.noteContext != null || widget.selectedText != null) {
        final parts = <String>[];
        if (widget.selectedText != null) {
          parts.add('Selected text: ${widget.selectedText}');
        }
        if (widget.noteContext != null) {
          parts.add('Note content: ${widget.noteContext}');
        }
        context = parts.join('\n\n');
      }

      // Get AI response
      final response = await aiService.generateResponse(text, context: context);

      if (mounted) {
        setState(() {
          _messages.add(AIMessage(content: response, isUser: false));
          _isLoading = false;
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.add(AIMessage(
            content: 'Error: ${e.toString().replaceAll('Exception: ', '')}',
            isUser: false,
            isError: true,
          ));
          _isLoading = false;
        });
        _scrollToBottom();
      }
    }
  }

  void _clearConversation() {
    setState(() {
      _messages.clear();
      _addWelcomeMessage();
    });
  }

  void _copyMessage(String content) {
    Clipboard.setData(ClipboardData(text: content));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Copied to clipboard'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Header
          _buildHeader(loc, colorScheme),
          // Messages
          Expanded(child: _buildMessagesList(colorScheme)),
          // Input area
          _buildInputArea(loc, colorScheme),
        ],
      ),
    );
  }

  Widget _buildHeader(AppLocalizations? loc, ColorScheme colorScheme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Row(
        children: [
          Icon(Icons.smart_toy, color: colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  loc?.ai_assistant ?? 'AI Assistant',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onSurface,
                  ),
                ),
                if (!_isAIConfigured)
                  Text(
                    loc?.ai_not_configured ?? 'Not configured',
                    style: TextStyle(
                      fontSize: 12,
                      color: colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
          // New chat button
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: loc?.new_chat ?? 'New Chat',
            onPressed: _clearConversation,
          ),
          // Close button
          if (widget.onClose != null)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: widget.onClose,
            ),
        ],
      ),
    );
  }

  Widget _buildMessagesList(ColorScheme colorScheme) {
    if (_messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              size: 64,
              color: colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              'Start a conversation',
              style: TextStyle(
                color: colorScheme.outline,
                fontSize: 16,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: _messages.length + (_isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _messages.length && _isLoading) {
          return _buildTypingIndicator(colorScheme);
        }
        return _buildMessageBubble(_messages[index], colorScheme);
      },
    );
  }

  Widget _buildMessageBubble(AIMessage message, ColorScheme colorScheme) {
    final isUser = message.isUser;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: message.isError
                  ? colorScheme.errorContainer
                  : colorScheme.primaryContainer,
              child: Icon(
                message.isError ? Icons.error : Icons.smart_toy,
                size: 18,
                color: message.isError
                    ? colorScheme.onErrorContainer
                    : colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: GestureDetector(
              onLongPress: () => _copyMessage(message.content),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isUser
                      ? colorScheme.primaryContainer
                      : message.isError
                          ? colorScheme.errorContainer
                          : colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isUser ? 16 : 4),
                    bottomRight: Radius.circular(isUser ? 4 : 16),
                  ),
                ),
                child: SelectableText(
                  message.content,
                  style: TextStyle(
                    color: isUser
                        ? colorScheme.onPrimaryContainer
                        : message.isError
                            ? colorScheme.onErrorContainer
                            : colorScheme.onSurface,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            CircleAvatar(
              radius: 16,
              backgroundColor: colorScheme.primary,
              child: Icon(
                Icons.person,
                size: 18,
                color: colorScheme.onPrimary,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTypingIndicator(ColorScheme colorScheme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: colorScheme.primaryContainer,
            child: Icon(
              Icons.smart_toy,
              size: 18,
              color: colorScheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(4),
                bottomRight: Radius.circular(16),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildDot(colorScheme, 0),
                const SizedBox(width: 4),
                _buildDot(colorScheme, 1),
                const SizedBox(width: 4),
                _buildDot(colorScheme, 2),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDot(ColorScheme colorScheme, int index) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 600),
      builder: (context, value, child) {
        return AnimatedContainer(
          duration: Duration(milliseconds: 300 + (index * 100)),
          curve: Curves.easeInOut,
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: colorScheme.primary.withOpacity(0.6),
            shape: BoxShape.circle,
          ),
        );
      },
    );
  }

  Widget _buildInputArea(AppLocalizations? loc, ColorScheme colorScheme) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        border: Border(
          top: BorderSide(color: colorScheme.outlineVariant),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _inputController,
              focusNode: _inputFocusNode,
              maxLines: 4,
              minLines: 1,
              decoration: InputDecoration(
                hintText: loc?.ai_ask_anything ?? 'Ask me anything...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: colorScheme.surface,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
              ),
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _sendMessage(),
              enabled: !_isLoading,
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _isLoading ? null : _sendMessage,
            icon: _isLoading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colorScheme.onPrimary,
                    ),
                  )
                : const Icon(Icons.send),
            style: IconButton.styleFrom(
              backgroundColor:
                  _isLoading ? colorScheme.outline : colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shows the AI conversation panel as a bottom sheet
Future<void> showAIConversationPanel(
  BuildContext context, {
  String? noteContext,
  String? selectedText,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => Padding(
      // Add padding for keyboard
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scrollController) => AIConversationPanel(
          noteContext: noteContext,
          selectedText: selectedText,
          onClose: () => Navigator.pop(context),
        ),
      ),
    ),
  );
}
