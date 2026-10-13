<?php
// The Hope Beacon walk-through in PHP 8.1+, with the curl extension that ships
// with PHP. No Composer packages. In Laravel, the same calls are Http::withHeaders(...).
//
//   HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... php walk.php
//   HB_SEND='Hello' php walk.php     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.
declare(strict_types=1);

function need(string $name): string
{
    $value = getenv($name);
    if ($value === false || $value === '') {
        fwrite(STDERR, "Set {$name}.\n");
        exit(1);
    }
    return $value;
}

$url = need('HB_URL');
$key = need('HB_KEY');
$email = need('HB_EMAIL');
$password = need('HB_PASSWORD');
$send = getenv('HB_SEND') ?: null;
$token = $key;
$roles = ['ds' => 'Explorer', 'dm' => 'Guide', 'admin' => 'Director', 'executive' => 'Executive Director'];

/** One request; the server's own words on failure. */
function call(string $method, string $path, ?array $body = null): mixed
{
    global $url, $key, $token;
    $ch = curl_init($url . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            "apikey: {$key}",
            "Authorization: Bearer {$token}",
            'Content-Type: application/json',
            'Prefer: return=representation',
        ],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, 'Could not reach ' . $url . ': ' . curl_error($ch) . "\n");
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $data = json_decode((string) $raw, true);
    if ($status >= 400) {
        if (($data['code'] ?? null) === 'PT403') {
            fwrite(STDERR, "This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, \"Two-step sign-in\".\n");
            exit(2);
        }
        fwrite(STDERR, "Request failed ({$status}): " . ($data['message'] ?? $data['msg'] ?? 'unknown error') . "\n");
        exit(1);
    }
    return $data;
}

// 1. Sign in.
$signin = call('POST', '/auth/v1/token?grant_type=password', ['email' => $email, 'password' => $password]);
$token = $signin['access_token'];
$me = $signin['user']['id'];

// 2. Who am I. The database decides what each person may read.
$profile = call('GET', "/rest/v1/profiles?id=eq.{$me}&select=full_name,role")[0];
echo "Signed in as {$profile['full_name']} (" . ($roles[$profile['role']] ?? $profile['role']) . ").\n";

// 3. The conversations you are in. The rules do the filtering.
$pairings = call('GET', '/rest/v1/pairings?select=id,journey_stage&order=created_at.asc');
echo 'Conversations you can see: ' . count($pairings) . "\n";
if (count($pairings) === 0) {
    echo "No conversation yet.\n";
    exit(0);
}
$pairing = $pairings[0];

// 4. Its five newest messages, shown oldest first.
$messages = call('GET', "/rest/v1/messages?pairing_id=eq.{$pairing['id']}&select=sender_id,body&order=created_at.desc&limit=5");
echo "Latest messages (journey stage: {$pairing['journey_stage']}):\n";
foreach (array_reverse($messages) as $m) {
    echo '  ' . ($m['sender_id'] === $me ? 'You: ' : 'Them:') . " {$m['body']}\n";
}

// 5. Only when asked: send one message as yourself.
if ($send !== null) {
    call('POST', '/rest/v1/messages', ['pairing_id' => $pairing['id'], 'sender_id' => $me, 'body' => $send]);
    echo "Sent: {$send}\n";
}
