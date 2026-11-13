// The Hope Beacon walk-through in Java 17+, with java.net.http and Jackson.
// The same calls work on Android with OkHttp or Ktor.
//
//   HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... mvn -q compile exec:java
//   HB_SEND='Hello' mvn -q compile exec:java     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

public class Walk {
  static final ObjectMapper JSON = new ObjectMapper();
  static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
  static final Map<String, String> ROLES =
      Map.of("ds", "Explorer", "dm", "Guide", "admin", "Director", "executive", "Executive Director");
  static String url, key, token;

  static String need(String name) {
    String v = System.getenv(name);
    if (v == null || v.isEmpty()) {
      System.err.println("Set " + name + ".");
      System.exit(1);
    }
    return v;
  }

  /** One request; the server's own words on failure. */
  static JsonNode call(String method, String path, Object body) throws Exception {
    HttpRequest.BodyPublisher payload = body == null
        ? HttpRequest.BodyPublishers.noBody()
        : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body));
    HttpRequest req = HttpRequest.newBuilder(URI.create(url + path))
        .method(method, payload)
        .header("apikey", key)
        .header("Authorization", "Bearer " + token)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .build();
    HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
    JsonNode data = res.body().isEmpty() ? JSON.nullNode() : JSON.readTree(res.body());
    if (res.statusCode() >= 400) {
      if ("PT403".equals(data.path("code").asText())) {
        System.err.println("This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, \"Two-step sign-in\".");
        System.exit(2);
      }
      String msg = data.path("message").asText(data.path("msg").asText("unknown error"));
      System.err.println("Request failed (" + res.statusCode() + "): " + msg);
      System.exit(1);
    }
    return data;
  }

  public static void main(String[] args) throws Exception {
    url = need("HB_URL");
    key = need("HB_KEY");
    token = key;

    // 1. Sign in.
    JsonNode signin = call("POST", "/auth/v1/token?grant_type=password",
        Map.of("email", need("HB_EMAIL"), "password", need("HB_PASSWORD")));
    token = signin.get("access_token").asText();
    String me = signin.get("user").get("id").asText();

    // 2. Who am I. The database decides what each person may read.
    JsonNode profile = call("GET", "/rest/v1/profiles?id=eq." + me + "&select=full_name,role", null).get(0);
    String role = profile.get("role").asText();
    System.out.println("Signed in as " + profile.get("full_name").asText() + " (" + ROLES.getOrDefault(role, role) + ").");

    // 3. The conversations you are in. The rules do the filtering.
    JsonNode pairings = call("GET", "/rest/v1/pairings?select=id,journey_stage&order=created_at.asc", null);
    System.out.println("Conversations you can see: " + pairings.size());
    if (pairings.isEmpty()) {
      System.out.println("No conversation yet.");
      return;
    }
    String id = pairings.get(0).get("id").asText();

    // 4. Its five newest messages, shown oldest first.
    JsonNode messages = call("GET",
        "/rest/v1/messages?pairing_id=eq." + id + "&select=sender_id,body&order=created_at.desc&limit=5", null);
    System.out.println("Latest messages (journey stage: " + pairings.get(0).get("journey_stage").asText() + "):");
    for (int i = messages.size() - 1; i >= 0; i--) {
      JsonNode m = messages.get(i);
      System.out.println("  " + (me.equals(m.get("sender_id").asText()) ? "You: " : "Them:") + " " + m.get("body").asText());
    }

    // 5. Only when asked: send one message as yourself.
    String text = System.getenv("HB_SEND");
    if (text != null && !text.isEmpty()) {
      call("POST", "/rest/v1/messages", Map.of("pairing_id", id, "sender_id", me, "body", text));
      System.out.println("Sent: " + text);
    }
  }
}
