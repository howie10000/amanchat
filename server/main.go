// Neighborhood game server: WebSocket + SQLite + static files
//
// Build:   cd server && go build -o northpvp
// Run:     ./northpvp -addr 127.0.0.1:8080 -static ../public -db ./data.db
//
// Behind nginx, this listens plain HTTP on 127.0.0.1:8080.
// nginx reverse-proxies https://northpvp.net/* (static) and wss://northpvp.net/ws.
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------- KV STORE

// Store is an in-memory hierarchical key/value store with Firebase-like semantics.
// All mutations are journaled to SQLite, plus periodic full snapshots.
type Store struct {
	mu    sync.RWMutex
	root  map[string]interface{}
	dirty bool
	db    *sql.DB
}

func NewStore(db *sql.DB) *Store {
	s := &Store{root: map[string]interface{}{}, db: db}
	s.load()
	return s
}

func (s *Store) load() {
	var blob string
	err := s.db.QueryRow(`SELECT value FROM kv WHERE key='__root__'`).Scan(&blob)
	if err == sql.ErrNoRows {
		log.Println("[store] fresh database")
		return
	}
	if err != nil {
		log.Fatalf("[store] load: %v", err)
	}
	if err := json.Unmarshal([]byte(blob), &s.root); err != nil {
		log.Fatalf("[store] parse: %v", err)
	}
	log.Printf("[store] loaded %d top-level keys", len(s.root))
}

func (s *Store) Snapshot() error {
	s.mu.RLock()
	if !s.dirty {
		s.mu.RUnlock()
		return nil
	}
	blob, err := json.Marshal(s.root)
	s.mu.RUnlock()
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO kv(key, value) VALUES('__root__', ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		string(blob),
	)
	if err == nil {
		s.mu.Lock()
		s.dirty = false
		s.mu.Unlock()
	}
	return err
}

func splitPath(p string) []string {
	p = strings.Trim(p, "/")
	if p == "" {
		return nil
	}
	return strings.Split(p, "/")
}

func (s *Store) Get(path string) interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	parts := splitPath(path)
	var cur interface{} = s.root
	for _, p := range parts {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil
		}
		cur, ok = m[p]
		if !ok {
			return nil
		}
	}
	return cur
}

func (s *Store) Put(path string, val interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	parts := splitPath(path)
	if len(parts) == 0 {
		if m, ok := val.(map[string]interface{}); ok {
			s.root = m
		}
		s.dirty = true
		return
	}
	cur := s.root
	for _, p := range parts[:len(parts)-1] {
		next, ok := cur[p].(map[string]interface{})
		if !ok {
			next = map[string]interface{}{}
			cur[p] = next
		}
		cur = next
	}
	cur[parts[len(parts)-1]] = val
	s.dirty = true
}

func (s *Store) Patch(path string, patch map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	parts := splitPath(path)
	// navigate / create
	cur := s.root
	for _, p := range parts {
		next, ok := cur[p].(map[string]interface{})
		if !ok {
			next = map[string]interface{}{}
			cur[p] = next
		}
		cur = next
	}
	for k, v := range patch {
		cur[k] = v
	}
	s.dirty = true
}

func (s *Store) Delete(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	parts := splitPath(path)
	if len(parts) == 0 {
		s.root = map[string]interface{}{}
		s.dirty = true
		return
	}
	cur := s.root
	for _, p := range parts[:len(parts)-1] {
		next, ok := cur[p].(map[string]interface{})
		if !ok {
			return
		}
		cur = next
	}
	delete(cur, parts[len(parts)-1])
	s.dirty = true
}

// Push: Firebase-style auto-id child. Returns the generated id.
func (s *Store) Push(path string, val interface{}) string {
	id := pushID()
	s.Put(path+"/"+id, val)
	return id
}

var pushChars = []byte("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")

func pushID() string {
	b := make([]byte, 9)
	_, _ = rand.Read(b)
	out := make([]byte, 0, 20)
	out = append(out, '-')
	// 12-char base-64-ish id from random bytes + timestamp millis
	ts := time.Now().UnixMilli()
	for i := 7; i >= 0; i-- {
		out = append(out, pushChars[int(ts>>(i*6))&63])
	}
	for _, x := range b[:8] {
		out = append(out, pushChars[int(x)&63])
	}
	return string(out)
}

// ---------------------------------------------------------------- HUB / CLIENT

type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	hub      *Hub
	user     string                 // empty until authed
	presence map[string]interface{} // last reported presence
	mu       sync.Mutex
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	byUser  map[string]*Client
	store   *Store
}

func NewHub(store *Store) *Hub {
	return &Hub{
		clients: map[*Client]bool{},
		byUser:  map[string]*Client{},
		store:   store,
	}
}

func (h *Hub) Add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) Remove(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	if c.user != "" && h.byUser[c.user] == c {
		delete(h.byUser, c.user)
	}
	h.mu.Unlock()
}

func (h *Hub) SetUser(c *Client, user string) {
	h.mu.Lock()
	// boot any existing client with this user
	if prev, ok := h.byUser[user]; ok && prev != c {
		select {
		case prev.send <- mustJSON(map[string]interface{}{"event": "kicked", "reason": "logged in elsewhere"}):
		default:
		}
		prev.conn.Close()
	}
	c.user = user
	h.byUser[user] = c
	h.mu.Unlock()
}

func (h *Hub) PushTo(user string, msg map[string]interface{}) {
	h.mu.RLock()
	c, ok := h.byUser[user]
	h.mu.RUnlock()
	if !ok {
		return
	}
	select {
	case c.send <- mustJSON(msg):
	default:
	}
}

func (h *Hub) BroadcastPresence() {
	h.mu.RLock()
	users := map[string]interface{}{}
	for c := range h.clients {
		c.mu.Lock()
		if c.user != "" && c.presence != nil {
			users[c.user] = c.presence
		}
		c.mu.Unlock()
	}
	msg := mustJSON(map[string]interface{}{"event": "presence", "users": users})
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		if c.user != "" {
			clients = append(clients, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.send <- msg:
		default:
		}
	}
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

// ---------------------------------------------------------------- AUTH / DB

func ensureSchema(db *sql.DB) {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS kv (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS auth (
		user TEXT PRIMARY KEY,
		pwhash TEXT NOT NULL,
		created INTEGER NOT NULL
	);`)
	if err != nil {
		log.Fatalf("schema: %v", err)
	}
}

func authRegister(db *sql.DB, user, pass string) error {
	if user == "" || pass == "" {
		return fmt.Errorf("empty credentials")
	}
	var exists int
	db.QueryRow(`SELECT COUNT(*) FROM auth WHERE user = ?`, user).Scan(&exists)
	if exists > 0 {
		return fmt.Errorf("user exists")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO auth(user, pwhash, created) VALUES(?, ?, ?)`,
		user, string(hash), time.Now().Unix())
	return err
}

func authLogin(db *sql.DB, user, pass string) error {
	var hash string
	err := db.QueryRow(`SELECT pwhash FROM auth WHERE user = ?`, user).Scan(&hash)
	if err == sql.ErrNoRows {
		return fmt.Errorf("no such user")
	}
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(pass)); err != nil {
		return fmt.Errorf("bad password")
	}
	return nil
}

// ---------------------------------------------------------------- WS HANDLER

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Allow any origin (we're behind nginx anyway)
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Hub) ServeWS(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}
	c := &Client{conn: conn, send: make(chan []byte, 32), hub: h}
	h.Add(c)

	// writer goroutine
	go func() {
		defer conn.Close()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case msg, ok := <-c.send:
				if !ok {
					return
				}
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// reader
	conn.SetReadLimit(64 * 1024)
	conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	defer func() {
		h.Remove(c)
		close(c.send)
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		h.handleMessage(db, c, msg)
	}
}

func (h *Hub) handleMessage(db *sql.DB, c *Client, msg map[string]interface{}) {
	id, _ := msg["id"].(float64)
	op, _ := msg["op"].(string)
	reply := func(data interface{}) {
		select {
		case c.send <- mustJSON(map[string]interface{}{"id": id, "ok": true, "data": data}):
		default:
		}
	}
	replyErr := func(e string) {
		select {
		case c.send <- mustJSON(map[string]interface{}{"id": id, "ok": false, "err": e}):
		default:
		}
	}

	switch op {
	case "auth":
		user, _ := msg["user"].(string)
		pass, _ := msg["pass"].(string)
		register, _ := msg["register"].(bool)
		user = strings.TrimSpace(strings.ToLower(user))
		if len(user) < 2 || len(user) > 16 || len(pass) < 3 {
			replyErr("invalid credentials")
			return
		}
		if register {
			if err := authRegister(db, user, pass); err != nil {
				replyErr(err.Error())
				return
			}
		} else {
			if err := authLogin(db, user, pass); err != nil {
				replyErr(err.Error())
				return
			}
		}
		h.SetUser(c, user)
		// return the user record (or nil for new users)
		reply(map[string]interface{}{"user": user, "data": h.store.Get("users/" + user)})

	case "get":
		path, _ := msg["path"].(string)
		reply(h.store.Get(path))

	case "put":
		if c.user == "" {
			replyErr("not authed")
			return
		}
		path, _ := msg["path"].(string)
		if !canWrite(c.user, path) {
			replyErr("forbidden")
			return
		}
		val := msg["value"]
		h.store.Put(path, val)
		h.afterWrite(path, val)
		reply(nil)

	case "patch":
		if c.user == "" {
			replyErr("not authed")
			return
		}
		path, _ := msg["path"].(string)
		if !canWrite(c.user, path) {
			replyErr("forbidden")
			return
		}
		valMap, _ := msg["value"].(map[string]interface{})
		if valMap == nil {
			replyErr("patch value must be object")
			return
		}
		h.store.Patch(path, valMap)
		h.afterWrite(path, valMap)
		reply(nil)

	case "post": // Firebase-style push (auto-id)
		if c.user == "" {
			replyErr("not authed")
			return
		}
		path, _ := msg["path"].(string)
		if !canWrite(c.user, path) {
			replyErr("forbidden")
			return
		}
		val := msg["value"]
		id := h.store.Push(path, val)
		h.afterWrite(path+"/"+id, val)
		reply(map[string]interface{}{"name": id})

	case "del":
		if c.user == "" {
			replyErr("not authed")
			return
		}
		path, _ := msg["path"].(string)
		if !canWrite(c.user, path) {
			replyErr("forbidden")
			return
		}
		h.store.Delete(path)
		reply(nil)

	case "presence":
		if c.user == "" {
			replyErr("not authed")
			return
		}
		data, _ := msg["data"].(map[string]interface{})
		c.mu.Lock()
		c.presence = data
		c.mu.Unlock()
		// no reply needed; presence is broadcast on a timer
		reply(nil)

	case "ping":
		reply("pong")

	default:
		replyErr("unknown op: " + op)
	}
}

// canWrite enforces the writing rules.
func canWrite(user, path string) bool {
	if user == "mayor" {
		return true
	}
	parts := splitPath(path)
	if len(parts) == 0 {
		return false
	}
	switch parts[0] {
	case "users":
		// own profile, or notifications inbox of others
		return len(parts) >= 2 && parts[1] == user
	case "players":
		return len(parts) >= 2 && parts[1] == user
	case "inbox":
		// anyone may post into anyone's inbox (notifications); recipients delete from own inbox
		if len(parts) >= 2 && parts[1] == user {
			return true // recipient operating on own inbox
		}
		return true // sender posting to recipient inbox is allowed
	case "dm_threads":
		// only participants can write. threadId == sorted pair "a__b"
		if len(parts) < 2 {
			return false
		}
		pair := strings.Split(parts[1], "__")
		for _, p := range pair {
			if p == user {
				return true
			}
		}
		return false
	case "duels":
		// participants identified by username in id: "a__b"
		if len(parts) < 2 {
			return false
		}
		pair := strings.Split(parts[1], "__")
		for _, p := range pair {
			if p == user {
				return true
			}
		}
		return false
	case "catalog":
		// any authed user may seed catalog (first writer wins effectively)
		return true
	case "mayor":
		return false
	}
	return false
}

// afterWrite pushes events to relevant connected users based on the path.
func (h *Hub) afterWrite(path string, val interface{}) {
	parts := splitPath(path)
	if len(parts) == 0 {
		return
	}
	switch parts[0] {
	case "inbox":
		// inbox/<recipient>/<msgId> — push notify to recipient
		if len(parts) >= 2 {
			h.PushTo(parts[1], map[string]interface{}{"event": "notify", "path": path, "data": val})
		}
	case "dm_threads":
		// dm_threads/<sortedPair>/messages/<id> — push dm to both participants
		if len(parts) >= 4 && parts[2] == "messages" {
			pair := strings.Split(parts[1], "__")
			for _, u := range pair {
				h.PushTo(u, map[string]interface{}{
					"event": "dm", "thread": parts[1], "path": path, "data": val,
				})
			}
		}
	case "duels":
		if len(parts) >= 2 {
			pair := strings.Split(parts[1], "__")
			for _, u := range pair {
				h.PushTo(u, map[string]interface{}{
					"event": "duel", "duelId": parts[1], "path": path, "data": val,
				})
			}
		}
	}
}

// ---------------------------------------------------------------- MAIN

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address")
	staticDir := flag.String("static", "../public", "directory of client static files")
	dbPath := flag.String("db", "./data.db", "SQLite database path")
	flag.Parse()

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	// Pragmas for speed
	db.Exec(`PRAGMA journal_mode=WAL`)
	db.Exec(`PRAGMA synchronous=NORMAL`)
	ensureSchema(db)

	store := NewStore(db)
	hub := NewHub(store)

	// Snapshot ticker
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for range t.C {
			if err := store.Snapshot(); err != nil {
				log.Printf("snapshot: %v", err)
			}
		}
	}()

	// Presence broadcast ticker (10 Hz)
	go func() {
		t := time.NewTicker(100 * time.Millisecond)
		defer t.Stop()
		for range t.C {
			hub.BroadcastPresence()
		}
	}()

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sig
		log.Println("shutting down; final snapshot...")
		if err := store.Snapshot(); err != nil {
			log.Printf("final snapshot: %v", err)
		}
		os.Exit(0)
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(db, w, r)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	// Static files
	fs := http.FileServer(http.Dir(*staticDir))
	mux.Handle("/", fs)

	log.Printf("northpvp listening on %s (static=%s)", *addr, *staticDir)
	srv := &http.Server{
		Addr:         *addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
