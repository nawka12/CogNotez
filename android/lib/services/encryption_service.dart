import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart';
import 'package:cryptography/cryptography.dart' as cryptography;

class EncryptionService {
  static const int keyLength = 32;
  static const int ivLength = 16;
  static const int saltLength = 32;
  static const int iterations = 210000;

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

  /// Encrypt text with password
  static Map<String, String> encrypt(String text, String password) {
    final salt = generateSalt();
    final key = deriveKey(password, salt);
    final iv = IV.fromSecureRandom(ivLength);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));
    
    final encrypted = encrypter.encrypt(text, iv: iv);
    
    return {
      'encrypted_content': encrypted.base64,
      'salt': salt,
      'iv': iv.base64,
    };
  }

  /// Decrypt text with password
  static String decrypt(String encryptedBase64, String saltBase64, String ivBase64, String password) {
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
}

