<?php
// Your own Hope Beacon server in plain PHP 8.1+ (PDO pgsql and curl, both in
// PHP), with every rule still in the database. In Laravel, the same steps are
// a middleware: see examples/server-laravel/.
//
// For each request: ask the sign-in service whether the token is genuine; open
// a transaction; tell the database who is asking for that transaction only;
// switch to the `authenticated` role; run the app's own check before every
// request; then the query. The row rules decide what comes back.
//
//   DATABASE_DSN='pgsql:host=...;port=5432;dbname=postgres' DATABASE_USER=postgres \
//   DATABASE_PASSWORD=... HB_URL=... HB_KEY=... php -S 127.0.0.1:8080 index.php
//
// The database password can read everything. Keep it on the server, never in
// an app or a browser. See docs/IN-ANY-LANGUAGE.md.
declare(strict_types=1);

header('Content-Type: application/json');

function reply(int $status, mixed $body): never
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

/** The token's claims, once the sign-in service has said the token is genuine. */
function claims(): array
{
    $token = trim(preg_replace('/^Bearer\s+/i', '', $_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($token === '') reply(401, ['message' => 'Sign in first.']);
    $ch = curl_init(getenv('HB_URL') . '/auth/v1/user');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['apikey: ' . getenv('HB_KEY'), "Authorization: Bearer {$token}"],
    ]);
    curl_exec($ch);
    if (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) !== 200) reply(401, ['message' => 'Sign in first.']);
    $payload = explode('.', $token)[1] ?? '';
    return json_decode(base64_decode(strtr($payload, '-_', '+/')), true) ?? reply(401, ['message' => 'Sign in first.']);
}

/** Run one query as the person, inside the database's rules. */
function asPerson(array $claims, string $sql, array $params = []): array
{
    $db = new PDO(getenv('DATABASE_DSN'), getenv('DATABASE_USER') ?: null, getenv('DATABASE_PASSWORD') ?: null,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    try {
        $db->beginTransaction();
        $db->prepare("select set_config('request.jwt.claims', ?, true)")->execute([json_encode($claims)]);
        $db->exec('set local role authenticated');
        $db->query('select public.refuse_suspended_requests()');
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $db->commit();
        return $rows;
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        $status = ['PT401' => 401, 'PT403' => 403, '42501' => 403][$e->getCode()] ?? 400;
        reply($status, ['message' => $e->errorInfo[2] ?? 'Refused.']);
    }
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') reply(405, ['message' => 'GET only.']);

if ($path === '/me') {
    $claims = claims();
    $rows = asPerson($claims, 'select full_name, role from public.profiles where id = ?', [$claims['sub']]);
    reply(200, $rows[0] ?? new stdClass());
}
if ($path === '/conversations') {
    // No filter: the row rules return only the conversations this person is in.
    reply(200, asPerson(claims(), 'select id::text, journey_stage from public.pairings order by created_at'));
}
if (preg_match('#^/conversations/([0-9a-f-]{36})/messages$#', $path, $m)) {
    reply(200, asPerson(claims(),
        'select sender_id::text, body, created_at::text from public.messages where pairing_id = ?::uuid order by created_at desc limit 20',
        [$m[1]]));
}
reply(404, ['message' => 'Not found.']);
