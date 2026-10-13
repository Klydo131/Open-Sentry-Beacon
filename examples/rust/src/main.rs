//! The Hope Beacon walk-through in Rust, with ureq and serde_json.
//!
//!     HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... cargo run --quiet
//!     HB_SEND='Hello' cargo run --quiet     # also sends one message
//!
//! examples/rest/walk.sh is the same walk with curl, one request at a time.
use serde_json::{json, Value};
use std::{env, process::exit};

fn need(name: &str) -> String {
    env::var(name).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| {
        eprintln!("Set {name}.");
        exit(1)
    })
}

struct Api {
    url: String,
    key: String,
    token: String,
}

impl Api {
    /// One request; the server's own words on failure.
    fn call(&self, method: &str, path: &str, body: Option<Value>) -> Value {
        let req = ureq::request(method, &format!("{}{}", self.url, path))
            .set("apikey", &self.key)
            .set("Authorization", &format!("Bearer {}", self.token))
            .set("Prefer", "return=representation");
        let res = match body {
            Some(b) => req.send_json(b),
            None => req.call(),
        };
        match res {
            Ok(r) => r.into_json().unwrap_or(Value::Null),
            Err(ureq::Error::Status(status, r)) => {
                let data: Value = r.into_json().unwrap_or(Value::Null);
                if data["code"] == "PT403" {
                    eprintln!("This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, \"Two-step sign-in\".");
                    exit(2);
                }
                let msg = data["message"].as_str().or(data["msg"].as_str()).unwrap_or("unknown error");
                eprintln!("Request failed ({status}): {msg}");
                exit(1)
            }
            Err(e) => {
                eprintln!("Could not reach {}: {e}", self.url);
                exit(1)
            }
        }
    }
}

fn main() {
    let mut api = Api { url: need("HB_URL"), key: need("HB_KEY"), token: String::new() };
    api.token = api.key.clone();
    let (email, password) = (need("HB_EMAIL"), need("HB_PASSWORD"));

    // 1. Sign in.
    let signin = api.call("POST", "/auth/v1/token?grant_type=password", Some(json!({ "email": email, "password": password })));
    api.token = signin["access_token"].as_str().unwrap_or_default().to_string();
    let me = signin["user"]["id"].as_str().unwrap_or_default().to_string();

    // 2. Who am I. The database decides what each person may read.
    let profile = &api.call("GET", &format!("/rest/v1/profiles?id=eq.{me}&select=full_name,role"), None)[0];
    let role = profile["role"].as_str().unwrap_or_default();
    let label = match role {
        "ds" => "Explorer",
        "dm" => "Guide",
        "admin" => "Director",
        "executive" => "Executive Director",
        other => other,
    };
    println!("Signed in as {} ({label}).", profile["full_name"].as_str().unwrap_or_default());

    // 3. The conversations you are in. The rules do the filtering.
    let pairings = api.call("GET", "/rest/v1/pairings?select=id,journey_stage&order=created_at.asc", None);
    let pairings = pairings.as_array().cloned().unwrap_or_default();
    println!("Conversations you can see: {}", pairings.len());
    let Some(pairing) = pairings.first() else {
        println!("No conversation yet.");
        return;
    };
    let id = pairing["id"].as_str().unwrap_or_default();

    // 4. Its five newest messages, shown oldest first.
    let path = format!("/rest/v1/messages?pairing_id=eq.{id}&select=sender_id,body&order=created_at.desc&limit=5");
    let messages = api.call("GET", &path, None);
    println!("Latest messages (journey stage: {}):", pairing["journey_stage"].as_str().unwrap_or_default());
    for m in messages.as_array().into_iter().flatten().rev() {
        let who = if m["sender_id"] == me.as_str() { "You: " } else { "Them:" };
        println!("  {who} {}", m["body"].as_str().unwrap_or_default());
    }

    // 5. Only when asked: send one message as yourself.
    if let Some(text) = env::var("HB_SEND").ok().filter(|t| !t.is_empty()) {
        api.call("POST", "/rest/v1/messages", Some(json!({ "pairing_id": id, "sender_id": me, "body": text })));
        println!("Sent: {text}");
    }
}
