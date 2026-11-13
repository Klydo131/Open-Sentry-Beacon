// The Hope Beacon walk-through in C++17, with libcurl and nlohmann/json.
//
//   cmake -S . -B build && cmake --build build
//   HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... ./build/walk
//   HB_SEND='Hello' ./build/walk     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.
#include <curl/curl.h>
#include <nlohmann/json.hpp>

#include <cstdlib>
#include <iostream>
#include <map>
#include <string>

using json = nlohmann::json;

static std::string need(const char* name) {
  const char* v = std::getenv(name);
  if (!v || !*v) {
    std::cerr << "Set " << name << ".\n";
    std::exit(1);
  }
  return v;
}

static size_t collect(char* data, size_t size, size_t n, void* out) {
  static_cast<std::string*>(out)->append(data, size * n);
  return size * n;
}

struct Api {
  std::string url, key, token;

  // One request; the server's own words on failure.
  json call(const std::string& method, const std::string& path, const json* body = nullptr) {
    CURL* curl = curl_easy_init();
    std::string answer, payload = body ? body->dump() : "";
    curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, ("apikey: " + key).c_str());
    headers = curl_slist_append(headers, ("Authorization: Bearer " + token).c_str());
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, "Prefer: return=representation");
    curl_easy_setopt(curl, CURLOPT_URL, (url + path).c_str());
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, collect);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &answer);
    if (body) curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload.c_str());
    CURLcode rc = curl_easy_perform(curl);
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    if (rc != CURLE_OK) {
      std::cerr << "Could not reach " << url << ": " << curl_easy_strerror(rc) << "\n";
      std::exit(1);
    }
    json data = json::parse(answer, nullptr, false);
    if (status >= 400) {
      // `code` is text from the data API ("PT403") but a number from sign-in (400).
      if (data.is_object() && data.contains("code") && data["code"] == "PT403") {
        std::cerr << "This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, \"Two-step sign-in\".\n";
        std::exit(2);
      }
      std::string msg = data.is_object() ? data.value("message", data.value("msg", "unknown error")) : "unknown error";
      std::cerr << "Request failed (" << status << "): " << msg << "\n";
      std::exit(1);
    }
    return data;
  }
};

int main() {
  curl_global_init(CURL_GLOBAL_DEFAULT);
  Api api{need("HB_URL"), need("HB_KEY"), ""};
  api.token = api.key;
  const std::map<std::string, std::string> roles{
      {"ds", "Explorer"}, {"dm", "Guide"}, {"admin", "Director"}, {"executive", "Executive Director"}};

  // 1. Sign in.
  json credentials{{"email", need("HB_EMAIL")}, {"password", need("HB_PASSWORD")}};
  json signin = api.call("POST", "/auth/v1/token?grant_type=password", &credentials);
  api.token = signin["access_token"];
  std::string me = signin["user"]["id"];

  // 2. Who am I. The database decides what each person may read.
  json profile = api.call("GET", "/rest/v1/profiles?id=eq." + me + "&select=full_name,role")[0];
  std::string role = profile["role"];
  std::cout << "Signed in as " << profile["full_name"].get<std::string>() << " ("
            << (roles.count(role) ? roles.at(role) : role) << ").\n";

  // 3. The conversations you are in. The rules do the filtering.
  json pairings = api.call("GET", "/rest/v1/pairings?select=id,journey_stage&order=created_at.asc");
  std::cout << "Conversations you can see: " << pairings.size() << "\n";
  if (pairings.empty()) {
    std::cout << "No conversation yet.\n";
    return 0;
  }
  std::string id = pairings[0]["id"];

  // 4. Its five newest messages, shown oldest first.
  json messages = api.call("GET", "/rest/v1/messages?pairing_id=eq." + id +
                                      "&select=sender_id,body&order=created_at.desc&limit=5");
  std::cout << "Latest messages (journey stage: " << pairings[0]["journey_stage"].get<std::string>() << "):\n";
  for (auto m = messages.rbegin(); m != messages.rend(); ++m) {
    std::cout << "  " << ((*m)["sender_id"] == me ? "You: " : "Them:") << " " << (*m)["body"].get<std::string>() << "\n";
  }

  // 5. Only when asked: send one message as yourself.
  if (const char* text = std::getenv("HB_SEND"); text && *text) {
    json message{{"pairing_id", id}, {"sender_id", me}, {"body", text}};
    api.call("POST", "/rest/v1/messages", &message);
    std::cout << "Sent: " << text << "\n";
  }
  curl_global_cleanup();
  return 0;
}
