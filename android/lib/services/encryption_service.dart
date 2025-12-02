import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart';
import 'package:cryptography/cryptography.dart' as cryptography;

class EncryptionService {
  static const int keyLength = 32;
  static const int ivLength = 16;
  static const int saltLength = 16; // 16 bytes for GCM IV, 16 bytes for salt
  static const int gcmIvLength = 12; // 96-bit IV for GCM (desktop uses 12 bytes)
  static const int iterations = 210000; // OWASP recommended minimum

  static final cryptography.AesGcm _desktopAesGcm =
      cryptography.AesGcm.with256bits();

  /// Derive encryption key from password using PBKDF2
  ///
  /// [customIterations] allows us to match the iteration count used by the
  /// desktop Electron app when decrypting its envelopes.
  static Key deriveKey(String password, String saltBase64,
      {int? customIterations}) {
    final salt = base64Decode(saltBase64);
    final passwordBytes = utf8.encode(password);
    final rounds = customIterations ?? iterations;
    
    // PBKDF2 with HMAC-SHA256
    var derivedKey = List<int>.filled(keyLength, 0);
    var blockCount = (keyLength / 32).ceil(); // SHA256 output is 32 bytes
    
    for (var i = 1; i <= blockCount; i++) {
      var u =
          Hmac(sha256, passwordBytes).convert(salt + _intToBytes(i)).bytes;
      var t = List<int>.from(u);

      for (var j = 1; j < rounds; j++) {
        u = Hmac(sha256, passwordBytes).convert(u).bytes;
        for (var k = 0; k < u.length; k++) {
          t[k] ^= u[k];
        }
      }
      
      var start = (i - 1) * 32;
      var end = (start + 32 > keyLength) ? keyLength : start + 32;
      derivedKey.setRange(start, end, t);
    }
    
    return Key(Uint8List.fromList(derivedKey));
  }
  
  static List<int> _intToBytes(int value) {
    return [
      (value >> 24) & 0xff,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ];
  }

  /// Generate a random salt
  static String generateSalt() {
    final random = Random.secure();
    final salt = List<int>.generate(saltLength, (_) => random.nextInt(256));
    return base64Encode(salt);
  }

  /// Encrypt text with password using desktop-compatible format
  static Future<Map<String, String>> encrypt(String text, String password) async {
    // Use the desktop-compatible sync data encryption format
    final envelope = await encryptSyncData(
      {'content': text},
      password,
    );

    // Convert to the format expected by the desktop app
    return {
      'encrypted_content': jsonEncode(envelope),
      'salt': '', // These fields are kept for backward compatibility but not used
      'iv': '',   // The actual salt and IV are inside the envelope
    };
  }

  /// Decrypt text with password - handles both old and new formats
  static Future<String> decrypt(String encryptedBase64, String saltBase64, String ivBase64, String password) async {
    // First check if this is a desktop-compatible envelope format
    if (isDesktopEnvelope(encryptedBase64)) {
      return await decryptDesktopEnvelope(encryptedBase64, password);
    }

    // Fallback to old format for backward compatibility
    final key = deriveKey(password, saltBase64);
    final iv = IV.fromBase64(ivBase64);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));

    final encrypted = Encrypted.fromBase64(encryptedBase64);
    return encrypter.decrypt(encrypted, iv: iv);
  }

  /// Check if the encrypted content looks like a desktop encryption envelope.
  ///
  /// Desktop (Electron) stores password-protected notes as a JSON envelope:
  /// {"v":1,"alg":"AES-256-GCM","kdf":"PBKDF2-SHA256","iter":210000,
  ///  "salt":"...","iv":"...","ct":"...","tag":"..."}
  static bool isDesktopEnvelope(String encryptedContent) {
    final trimmed = encryptedContent.trimLeft();
    if (!trimmed.startsWith('{')) return false;
    try {
      final json = jsonDecode(trimmed);
      if (json is! Map<String, dynamic>) return false;
      return json.containsKey('ct') &&
          json.containsKey('tag') &&
          json.containsKey('iv') &&
          json.containsKey('salt');
    } catch (_) {
      return false;
    }
  }

  /// Decrypt a desktop (Electron) encryption envelope and return the note content.
  ///
  /// This is used to unlock password-protected notes that were created on the
  /// desktop app and imported into Android via backup/sync.
  static Future<String> decryptDesktopEnvelope(
    String envelopeJson,
    String password,
  ) async {
    final envelope = jsonDecode(envelopeJson) as Map<String, dynamic>;

    final saltBase64 = envelope['salt'] as String;
    final ivBase64 = envelope['iv'] as String;
    final ctBase64 = envelope['ct'] as String;
    final tagBase64 = envelope['tag'] as String;

    final salt = base64Decode(saltBase64);
    final iv = base64Decode(ivBase64);
    final ciphertext = base64Decode(ctBase64);
    final tag = base64Decode(tagBase64);

    final iter = (envelope['iter'] is int)
        ? envelope['iter'] as int
        : iterations;

    // Derive the same key as the desktop app (PBKDF2-HMAC-SHA256)
    final keyBytes = deriveKey(
      password,
      base64Encode(salt),
      customIterations: iter,
    ).bytes;
    final secretKey = cryptography.SecretKey(keyBytes);
    final secretBox = cryptography.SecretBox(
      ciphertext,
      nonce: iv,
      mac: cryptography.Mac(tag),
    );

    final clearBytes =
        await _desktopAesGcm.decrypt(secretBox, secretKey: secretKey);

    final decoded = jsonDecode(utf8.decode(clearBytes));
    if (decoded is Map<String, dynamic>) {
      return decoded['content'] as String? ?? '';
    }
    // Fallback: treat decrypted data as plain string.
    return decoded.toString();
  }

  /// Hash password for verification (optional)
  static String hashPassword(String password, String salt) {
    final key = deriveKey(password, salt);
    return base64Encode(key.bytes);
  }

  // ===========================================================================
  // SYNC DATA ENCRYPTION (Desktop-compatible format)
  // ===========================================================================

  /// Generate a deterministic salt from passphrase for multi-device compatibility.
  /// This ensures the same passphrase produces the same salt on all devices.
  static String deriveSaltFromPassphrase(String passphrase) {
    // Use PBKDF2 with fixed parameters to derive salt deterministically
    // Must match desktop: crypto.pbkdf2Sync(passphrase, 'CogNotez-Salt-Derivation-Key', 1, 16, 'sha256')
    final passwordBytes = utf8.encode(passphrase);
    final fixedSalt = utf8.encode('CogNotez-Salt-Derivation-Key');
    
    // Single iteration PBKDF2 for salt derivation
    var u = Hmac(sha256, passwordBytes).convert(fixedSalt + _intToBytes(1)).bytes;
    
    // Take first 16 bytes
    return base64Encode(u.sublist(0, 16));
  }

  /// Generate a random 16-byte salt
  static String generateRandomSalt() {
    final random = Random.secure();
    final salt = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Encode(salt);
  }

  /// Encrypt sync data using desktop-compatible AES-256-GCM format.
  /// Returns an envelope object that can be uploaded to Google Drive.
  static Future<Map<String, dynamic>> encryptSyncData(
    Map<String, dynamic> data,
    String passphrase, {
    String? saltBase64,
    int? customIterations,
  }) async {
    final salt = saltBase64 != null
        ? base64Decode(saltBase64)
        : base64Decode(generateRandomSalt());
    final iv = List<int>.generate(gcmIvLength, (_) => Random.secure().nextInt(256));
    final iter = customIterations ?? iterations;

    // Derive key using PBKDF2
    final keyBytes = deriveKey(
      passphrase,
      base64Encode(salt),
      customIterations: iter,
    ).bytes;

    // Convert data to JSON bytes
    final plaintext = utf8.encode(jsonEncode(data));

    // Encrypt using cryptography package (matches desktop's crypto.createCipheriv)
    final secretKey = cryptography.SecretKey(keyBytes);
    final secretBox = await _desktopAesGcm.encrypt(
      plaintext,
      secretKey: secretKey,
      nonce: iv,
    );

    return {
      'v': 1,
      'alg': 'AES-256-GCM',
      'kdf': 'PBKDF2-SHA256',
      'iter': iter,
      'salt': base64Encode(salt),
      'iv': base64Encode(iv),
      'ct': base64Encode(secretBox.cipherText),
      'tag': base64Encode(secretBox.mac.bytes),
    };
  }

  /// Decrypt sync data from desktop-compatible AES-256-GCM envelope.
  /// Returns the original Map<String, dynamic> data.
  static Future<Map<String, dynamic>> decryptSyncData(
    Map<String, dynamic> envelope,
    String passphrase,
  ) async {
    // Validate envelope format
    if (envelope['v'] != 1 || envelope['alg'] != 'AES-256-GCM') {
      throw Exception('Unsupported encryption format');
    }

    final salt = base64Decode(envelope['salt'] as String);
    final iv = base64Decode(envelope['iv'] as String);
    final ct = base64Decode(envelope['ct'] as String);
    final tag = base64Decode(envelope['tag'] as String);
    final iter = envelope['iter'] as int? ?? iterations;

    // Derive key
    final keyBytes = deriveKey(
      passphrase,
      base64Encode(salt),
      customIterations: iter,
    ).bytes;

    // Decrypt
    final secretKey = cryptography.SecretKey(keyBytes);
    final secretBox = cryptography.SecretBox(
      ct,
      nonce: iv,
      mac: cryptography.Mac(tag),
    );

    final clearBytes = await _desktopAesGcm.decrypt(
      secretBox,
      secretKey: secretKey,
    );

    final decoded = jsonDecode(utf8.decode(clearBytes));
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw Exception('Decrypted data is not a valid JSON object');
  }

  /// Check if data is an encrypted sync envelope (desktop format).
  static bool isEncryptedSyncData(dynamic data) {
    if (data is! Map<String, dynamic>) return false;
    return data['v'] == 1 &&
        data['alg'] == 'AES-256-GCM' &&
        data.containsKey('ct') &&
        data.containsKey('tag') &&
        data.containsKey('iv') &&
        data.containsKey('salt');
  }

  /// Validate passphrase strength
  static ValidationResult validatePassphrase(String passphrase) {
    final errors = <String>[];
    
    if (passphrase.isEmpty) {
      errors.add('Passphrase is required');
    } else if (passphrase.length < 8) {
      errors.add('Passphrase must be at least 8 characters long');
    }
    
    return ValidationResult(
      isValid: errors.isEmpty,
      errors: errors,
    );
  }
}

class ValidationResult {
  final bool isValid;
  final List<String> errors;
  
  ValidationResult({required this.isValid, required this.errors});
}

