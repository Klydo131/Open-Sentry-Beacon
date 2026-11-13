<?php
// The same pattern as examples/server-php, as Laravel middleware.
//
// Put this file in app/Http/Middleware/, register it on your API routes, and
// in a controller wrap each query in HopeBeaconRules::asPerson():
//
//     Route::middleware(HopeBeaconRules::class)->get('/conversations', fn (Request $r) =>
//         HopeBeaconRules::asPerson($r, fn () => DB::select('select id, journey_stage from public.pairings')));
//
// config/database.php points the `pgsql` connection at your Supabase database.
// That password can read everything: it stays in .env on the server.
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class HopeBeaconRules
{
    /** Refuse anybody whose token the sign-in service does not recognise. */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $genuine = $token && Http::withHeaders(['apikey' => config('services.hope_beacon.key')])
            ->withToken($token)
            ->get(config('services.hope_beacon.url') . '/auth/v1/user')
            ->ok();
        if (! $genuine) {
            return response()->json(['message' => 'Sign in first.'], 401);
        }
        $payload = explode('.', $token)[1];
        $request->attributes->set('claims', json_decode(base64_decode(strtr($payload, '-_', '+/')), true));
        return $next($request);
    }

    /** Run $query as the person: their claims, the authenticated role, the app's own check, one transaction. */
    public static function asPerson(Request $request, Closure $query): mixed
    {
        return DB::transaction(function () use ($request, $query) {
            DB::select("select set_config('request.jwt.claims', ?, true)", [json_encode($request->attributes->get('claims'))]);
            DB::statement('set local role authenticated');
            DB::select('select public.refuse_suspended_requests()');
            return $query();
        });
    }
}
