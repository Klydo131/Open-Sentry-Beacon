// The Hope Beacon walk-through in Dart 3, with package:http. The same code runs
// inside a Flutter app; there, keep the token in flutter_secure_storage rather
// than in memory, and read HB_URL and HB_KEY from your build configuration.
//
//   dart pub get
//   HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... dart run bin/walk.dart
//   HB_SEND='Hello' dart run bin/walk.dart     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

const roles = {'ds': 'Explorer', 'dm': 'Guide', 'admin': 'Director', 'executive': 'Executive Director'};

String need(String name) {
  final v = Platform.environment[name];
  if (v == null || v.isEmpty) {
    stderr.writeln('Set $name.');
    exit(1);
  }
  return v;
}

final url = need('HB_URL');
final key = need('HB_KEY');
var token = key;

/// One request; the server's own words on failure.
Future<dynamic> call(String method, String path, [Object? body]) async {
  final req = http.Request(method, Uri.parse('$url$path'))
    ..headers.addAll({
      'apikey': key,
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    });
  if (body != null) req.body = jsonEncode(body);
  final res = await http.Response.fromStream(await req.send());
  final data = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
  if (res.statusCode >= 400) {
    if (data is Map && data['code'] == 'PT403') {
      stderr.writeln('This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, "Two-step sign-in".');
      exit(2);
    }
    final msg = data is Map ? (data['message'] ?? data['msg'] ?? 'unknown error') : 'unknown error';
    stderr.writeln('Request failed (${res.statusCode}): $msg');
    exit(1);
  }
  return data;
}

Future<void> main() async {
  // 1. Sign in.
  final signin = await call('POST', '/auth/v1/token?grant_type=password',
      {'email': need('HB_EMAIL'), 'password': need('HB_PASSWORD')});
  token = signin['access_token'] as String;
  final me = signin['user']['id'] as String;

  // 2. Who am I. The database decides what each person may read.
  final profile = (await call('GET', '/rest/v1/profiles?id=eq.$me&select=full_name,role'))[0];
  print('Signed in as ${profile['full_name']} (${roles[profile['role']] ?? profile['role']}).');

  // 3. The conversations you are in. The rules do the filtering.
  final pairings = await call('GET', '/rest/v1/pairings?select=id,journey_stage&order=created_at.asc') as List;
  print('Conversations you can see: ${pairings.length}');
  if (pairings.isEmpty) {
    print('No conversation yet.');
    return;
  }
  final pairing = pairings.first;

  // 4. Its five newest messages, shown oldest first.
  final messages = await call('GET',
      '/rest/v1/messages?pairing_id=eq.${pairing['id']}&select=sender_id,body&order=created_at.desc&limit=5') as List;
  print('Latest messages (journey stage: ${pairing['journey_stage']}):');
  for (final m in messages.reversed) {
    print('  ${m['sender_id'] == me ? 'You: ' : 'Them:'} ${m['body']}');
  }

  // 5. Only when asked: send one message as yourself.
  final text = Platform.environment['HB_SEND'];
  if (text != null && text.isNotEmpty) {
    await call('POST', '/rest/v1/messages', {'pairing_id': pairing['id'], 'sender_id': me, 'body': text});
    print('Sent: $text');
  }
}
