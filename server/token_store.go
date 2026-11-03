package drive

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/appstate"
)

// tokenStore holds one app's single-use, short-lived URL tokens. A browser
// anchor-download cannot send the bearer header, so the token in the URL is
// the credential. Each app has its own store: a token minted by one app must
// not work on another app's endpoint.
type tokenStore[T any] struct {
	mu      sync.Mutex
	entries map[string]tokenEntry[T]
}

type tokenEntry[T any] struct {
	value     T
	expiresAt time.Time
}

func newTokenStore[T any]() *tokenStore[T] {
	return &tokenStore[T]{entries: map[string]tokenEntry[T]{}}
}

// issue mints a random token for value, valid for ttl. It drops expired
// entries first, which keeps the store bounded without a sweeper goroutine.
func (s *tokenStore[T]) issue(value T, ttl time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, e := range s.entries {
		if now.After(e.expiresAt) {
			delete(s.entries, k)
		}
	}
	s.entries[token] = tokenEntry[T]{value: value, expiresAt: now.Add(ttl)}
	return token, nil
}

// redeem returns the token's value and removes it: a token works once, and
// an expired one not at all.
func (s *tokenStore[T]) redeem(token string) (T, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[token]
	delete(s.entries, token)
	if !ok || time.Now().After(e.expiresAt) {
		var zero T
		return zero, false
	}
	return e.value, true
}

var (
	downloadTokensKey = appstate.NewKey[*tokenStore[downloadToken]]("drive.downloadTokens")
	exportTokensKey   = appstate.NewKey[*tokenStore[exportToken]]("drive.exportTokens")
)

func downloadTokens(app core.App) *tokenStore[downloadToken] {
	return downloadTokensKey.GetOrInit(app, newTokenStore[downloadToken])
}

func exportTokens(app core.App) *tokenStore[exportToken] {
	return exportTokensKey.GetOrInit(app, newTokenStore[exportToken])
}
