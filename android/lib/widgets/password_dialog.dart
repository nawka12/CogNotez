import 'package:flutter/material.dart';
import '../models/note.dart';
import '../services/encryption_service.dart';
import '../l10n/app_localizations.dart';

class PasswordDialog extends StatefulWidget {
  final Note note;
  final bool isUnlocking;
  final Function(Note updatedNote, String? password) onComplete;

  const PasswordDialog({
    super.key,
    required this.note,
    required this.isUnlocking,
    required this.onComplete,
  });

  @override
  State<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<PasswordDialog> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  String? _error;
  bool _isLoading = false;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final loc = AppLocalizations.of(context);
    final password = _passwordController.text;
    
    if (password.isEmpty) {
      setState(() => _error = loc?.translate('password_required') ?? 'Password is required');
      return;
    }

    if (widget.isUnlocking) {
      // Try to decrypt
      await _unlockNote(password);
    } else {
      // Setting new password
      if (_confirmController.text != password) {
        setState(() => _error = loc?.translate('passwords_do_not_match') ?? 'Passwords do not match');
        return;
      }
      if (password.length < 4) {
        setState(() => _error = loc?.translate('password_too_short') ?? 'Password must be at least 4 characters');
        return;
      }
      await _lockNote(password);
    }
  }

  Future<void> _unlockNote(String password) async {
    final loc = AppLocalizations.of(context);
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      if (widget.note.encryptedContent == null) {
        throw Exception('Note encryption data is missing');
      }

      String decryptedContent;

      // Desktop notes store encryption data as a JSON envelope inside
      // encryptedContent. Android notes use separate salt/IV fields.
      if (EncryptionService.isDesktopEnvelope(widget.note.encryptedContent!)) {
        decryptedContent = await EncryptionService.decryptDesktopEnvelope(
          widget.note.encryptedContent!,
          password,
        );
      } else {
        if (widget.note.encryptionSalt == null ||
            widget.note.encryptionIv == null) {
          throw Exception('Note encryption data is missing');
        }

        decryptedContent = await EncryptionService.decrypt(
          widget.note.encryptedContent!,
          widget.note.encryptionSalt!,
          widget.note.encryptionIv!,
          password,
        );
      }

      final unlockedNote = widget.note.copyWith(
        content: decryptedContent,
      );

      widget.onComplete(unlockedNote, password);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() {
        _error = loc?.translate('password_incorrect_or_failed') ?? 'Incorrect password or decryption failed';
        _isLoading = false;
      });
    }
  }

  Future<void> _lockNote(String password) async {
    final loc = AppLocalizations.of(context);
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final encryptionResult = await EncryptionService.encrypt(
        widget.note.content,
        password,
      );

      final lockedNote = widget.note.copyWith(
        isPasswordProtected: true,
        encryptedContent: encryptionResult['encrypted_content'],
        encryptionSalt: encryptionResult['salt'],
        encryptionIv: encryptionResult['iv'],
      );

      widget.onComplete(lockedNote, password);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() {
        _error = loc?.translate('password_encrypt_failed') ?? 'Failed to encrypt note: $e';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return AlertDialog(
      title: Text(
        widget.isUnlocking
            ? (loc?.translate('unlock_note') ?? 'Unlock Note')
            : (loc?.translate('set_password') ?? 'Set Password'),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.isUnlocking)
            Text(loc?.translate('unlock_note_description') ?? 'Enter the password to unlock this note.')
          else
            Text(
              loc?.translate('set_password_description') ??
                  'Set a password to protect this note. You will need this password to view the note content.',
            ),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            autofocus: true,
            decoration: InputDecoration(
              labelText: loc?.translate('password_label') ?? 'Password',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            onSubmitted: (_) {
              if (widget.isUnlocking) {
                _handleSubmit();
              }
            },
          ),
          if (!widget.isUnlocking) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _confirmController,
              obscureText: _obscureConfirm,
              decoration: InputDecoration(
                labelText: loc?.translate('confirm_password_label') ?? 'Confirm Password',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(_obscureConfirm ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
                ),
              ),
              onSubmitted: (_) => _handleSubmit(),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: Text(loc?.cancel ?? 'Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleSubmit,
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(
                  widget.isUnlocking
                      ? (loc?.translate('unlock_action') ?? 'Unlock')
                      : (loc?.translate('set_password_action') ?? 'Set Password'),
                ),
        ),
      ],
    );
  }
}

class RemovePasswordDialog extends StatefulWidget {
  final Note note;
  final String currentPassword;
  final Function(Note updatedNote) onComplete;

  const RemovePasswordDialog({
    super.key,
    required this.note,
    required this.currentPassword,
    required this.onComplete,
  });

  @override
  State<RemovePasswordDialog> createState() => _RemovePasswordDialogState();
}

class _RemovePasswordDialogState extends State<RemovePasswordDialog> {
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  void _handleSubmit() {
    final loc = AppLocalizations.of(context);
    final password = _passwordController.text;
    
    if (password != widget.currentPassword) {
      setState(() => _error = loc?.translate('incorrect_password') ?? 'Incorrect password');
      return;
    }

    final unlockedNote = widget.note.copyWith(
      isPasswordProtected: false,
      clearEncryption: true,
    );

    widget.onComplete(unlockedNote);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return AlertDialog(
      title: Text(loc?.translate('remove_password_title') ?? 'Remove Password'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            loc?.translate('remove_password_description') ??
                'Enter the current password to remove protection from this note.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            autofocus: true,
            decoration: InputDecoration(
              labelText: loc?.translate('current_password_label') ?? 'Current Password',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            onSubmitted: (_) => _handleSubmit(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(loc?.cancel ?? 'Cancel'),
        ),
        FilledButton(
          onPressed: _handleSubmit,
          child: Text(loc?.translate('remove_password_action') ?? 'Remove Password'),
        ),
      ],
    );
  }
}
