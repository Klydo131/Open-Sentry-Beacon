// The Hope Beacon walk-through in Go 1.21+, standard library only.
//
//	HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... go run .
//	HB_SEND='Hello' go run .     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

var roles = map[string]string{"ds": "Explorer", "dm": "Guide", "admin": "Director", "executive": "Executive Director"}

var (
	baseURL = need("HB_URL")
	key     = need("HB_KEY")
	token   = key
	client  = &http.Client{Timeout: 15 * time.Second}
)

func need(name string) string {
	v := os.Getenv(name)
	if v == "" {
		fmt.Fprintf(os.Stderr, "Set %s.\n", name)
		os.Exit(1)
	}
	return v
}

// call makes one request and decodes the answer into out; it stops with the
// server's own words on failure.
func call(method, path string, body any, out any) {
	var payload *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		payload = bytes.NewReader(b)
	} else {
		payload = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, baseURL+path, payload)
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")
	res, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Could not reach %s: %v\n", baseURL, err)
		os.Exit(1)
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		var e struct{ Code, Message, Msg string }
		json.NewDecoder(res.Body).Decode(&e)
		if e.Code == "PT403" {
			fmt.Fprintln(os.Stderr, `This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, "Two-step sign-in".`)
			os.Exit(2)
		}
		msg := e.Message
		if msg == "" {
			msg = e.Msg
		}
		fmt.Fprintf(os.Stderr, "Request failed (%d): %s\n", res.StatusCode, msg)
		os.Exit(1)
	}
	if out != nil {
		json.NewDecoder(res.Body).Decode(out)
	}
}

func main() {
	email, password, send := need("HB_EMAIL"), need("HB_PASSWORD"), os.Getenv("HB_SEND")

	// 1. Sign in.
	var signin struct {
		AccessToken string `json:"access_token"`
		User        struct{ ID string } `json:"user"`
	}
	call("POST", "/auth/v1/token?grant_type=password", map[string]string{"email": email, "password": password}, &signin)
	token = signin.AccessToken
	me := signin.User.ID

	// 2. Who am I. The database decides what each person may read.
	var profiles []struct {
		FullName string `json:"full_name"`
		Role     string `json:"role"`
	}
	call("GET", "/rest/v1/profiles?id=eq."+me+"&select=full_name,role", nil, &profiles)
	label, ok := roles[profiles[0].Role]
	if !ok {
		label = profiles[0].Role
	}
	fmt.Printf("Signed in as %s (%s).\n", profiles[0].FullName, label)

	// 3. The conversations you are in. The rules do the filtering.
	var pairings []struct {
		ID           string `json:"id"`
		JourneyStage string `json:"journey_stage"`
	}
	call("GET", "/rest/v1/pairings?select=id,journey_stage&order=created_at.asc", nil, &pairings)
	fmt.Printf("Conversations you can see: %d\n", len(pairings))
	if len(pairings) == 0 {
		fmt.Println("No conversation yet.")
		return
	}
	pairing := pairings[0]

	// 4. Its five newest messages, shown oldest first.
	var messages []struct {
		SenderID string `json:"sender_id"`
		Body     string `json:"body"`
	}
	call("GET", "/rest/v1/messages?pairing_id=eq."+pairing.ID+"&select=sender_id,body&order=created_at.desc&limit=5", nil, &messages)
	fmt.Printf("Latest messages (journey stage: %s):\n", pairing.JourneyStage)
	for i := len(messages) - 1; i >= 0; i-- {
		who := "Them:"
		if messages[i].SenderID == me {
			who = "You: "
		}
		fmt.Printf("  %s %s\n", who, messages[i].Body)
	}

	// 5. Only when asked: send one message as yourself.
	if send != "" {
		call("POST", "/rest/v1/messages", map[string]string{"pairing_id": pairing.ID, "sender_id": me, "body": send}, nil)
		fmt.Printf("Sent: %s\n", send)
	}
}
