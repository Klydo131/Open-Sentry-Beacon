//! Your own Hope Beacon server in Rust (axum), with every rule still in the database.
//!
//! For each request: ask the sign-in service whether the token is genuine; open
//! a transaction; tell the database who is asking for that transaction only;
//! switch to the `authenticated` role; run the app's own check before every
//! request; then the query. The row rules decide what comes back.
//!
//!     DATABASE_URL=... HB_URL=... HB_KEY=... cargo run --release
//!
//! DATABASE_URL can read everything. Keep it on the server, never in an app or a
//! browser. Production: use a connection pool (deadpool-postgres) and TLS to the
//! database. See docs/IN-ANY-LANGUAGE.md.
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use std::{env, sync::Arc};
use tokio_postgres::{types::ToSql, NoTls};

struct Config {
    database_url: String,
    hb_url: String,
    hb_key: String,
    http: reqwest::Client,
}

type Reply = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn refuse(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "message": message })))
}

/// The token's claims, once the sign-in service has said the token is genuine.
async fn claims(cfg: &Config, headers: &HeaderMap) -> Result<Value, (StatusCode, Json<Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| refuse(StatusCode::UNAUTHORIZED, "Sign in first."))?;
    let genuine = cfg
        .http
        .get(format!("{}/auth/v1/user", cfg.hb_url))
        .header("apikey", &cfg.hb_key)
        .bearer_auth(token)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    let payload = token.split('.').nth(1).unwrap_or_default();
    match (genuine, URL_SAFE_NO_PAD.decode(payload.trim_end_matches('='))) {
        (true, Ok(bytes)) => serde_json::from_slice(&bytes).map_err(|_| refuse(StatusCode::UNAUTHORIZED, "Sign in first.")),
        _ => Err(refuse(StatusCode::UNAUTHORIZED, "Sign in first.")),
    }
}

/// Run one query as the person, inside the database's rules. Every selected
/// column must be text, so the example can return it as JSON without a mapping.
async fn as_person(cfg: &Config, claims: &Value, sql: &str, params: &[&(dyn ToSql + Sync)]) -> Reply {
    let failed = |e: tokio_postgres::Error| {
        let status = match e.code().map(|c| c.code()) {
            Some("PT401") => StatusCode::UNAUTHORIZED,
            Some("PT403") | Some("42501") => StatusCode::FORBIDDEN,
            _ => StatusCode::BAD_REQUEST,
        };
        refuse(status, e.as_db_error().map(|d| d.message()).unwrap_or("Refused."))
    };
    let (mut client, connection) = tokio_postgres::connect(&cfg.database_url, NoTls)
        .await
        .map_err(|_| refuse(StatusCode::SERVICE_UNAVAILABLE, "Database unavailable."))?;
    tokio::spawn(connection);
    let tx = client.transaction().await.map_err(failed)?;
    tx.execute("select set_config('request.jwt.claims', $1, true)", &[&claims.to_string()]).await.map_err(failed)?;
    tx.batch_execute("set local role authenticated; select public.refuse_suspended_requests();").await.map_err(failed)?;
    let rows = tx.query(sql, params).await.map_err(failed)?;
    tx.commit().await.map_err(failed)?;
    let out: Vec<Value> = rows
        .iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                obj.insert(col.name().to_string(), json!(row.get::<_, Option<String>>(i)));
            }
            Value::Object(obj)
        })
        .collect();
    Ok(Json(Value::Array(out)))
}

async fn me(State(cfg): State<Arc<Config>>, headers: HeaderMap) -> Reply {
    let c = claims(&cfg, &headers).await?;
    let id = c["sub"].as_str().unwrap_or_default().to_string();
    let Json(rows) = as_person(&cfg, &c, "select full_name, role::text from public.profiles where id = $1::text::uuid", &[&id]).await?;
    Ok(Json(rows.get(0).cloned().unwrap_or(json!({}))))
}

async fn conversations(State(cfg): State<Arc<Config>>, headers: HeaderMap) -> Reply {
    let c = claims(&cfg, &headers).await?;
    // No filter: the row rules return only the conversations this person is in.
    as_person(&cfg, &c, "select id::text, journey_stage::text from public.pairings order by created_at", &[]).await
}

async fn messages(State(cfg): State<Arc<Config>>, headers: HeaderMap, Path(id): Path<String>) -> Reply {
    let c = claims(&cfg, &headers).await?;
    as_person(
        &cfg,
        &c,
        "select sender_id::text, body, created_at::text from public.messages \
         where pairing_id = $1::text::uuid order by created_at desc limit 20",
        &[&id],
    )
    .await
}

#[tokio::main]
async fn main() {
    let cfg = Arc::new(Config {
        database_url: env::var("DATABASE_URL").expect("Set DATABASE_URL"),
        hb_url: env::var("HB_URL").expect("Set HB_URL"),
        hb_key: env::var("HB_KEY").expect("Set HB_KEY"),
        http: reqwest::Client::new(),
    });
    let app = Router::new()
        .route("/me", get(me))
        .route("/conversations", get(conversations))
        .route("/conversations/{id}/messages", get(messages))
        .with_state(cfg);
    let port = env::var("PORT").unwrap_or_else(|_| "8080".into());
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
