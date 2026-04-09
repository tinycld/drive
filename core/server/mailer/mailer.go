// Package mailer provides a shared email sending interface for all addons.
// It wraps the configured provider (e.g. Postmark) so that any addon can
// send transactional emails without depending on the mail addon.
//
// In development, emails are printed to stdout instead of delivered unless
// DELIVER_MAIL=true is set in the environment.
package mailer

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
)

// Recipient is an email address with an optional display name.
type Recipient struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Header is a custom email header.
type Header struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Attachment is a base64-encoded file attachment.
type Attachment struct {
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
	Content     string `json:"content"` // base64 encoded
	ContentID   string `json:"content_id,omitempty"`
}

// SendRequest is a full email send request with CC, BCC, attachments, and threading headers.
type SendRequest struct {
	From        string       `json:"from"`
	To          []Recipient  `json:"to"`
	Cc          []Recipient  `json:"cc,omitempty"`
	Bcc         []Recipient  `json:"bcc,omitempty"`
	Subject     string       `json:"subject"`
	HTMLBody    string       `json:"html_body"`
	TextBody    string       `json:"text_body"`
	ReplyTo     string       `json:"reply_to,omitempty"`
	InReplyTo   string       `json:"in_reply_to,omitempty"`
	References  string       `json:"references,omitempty"`
	Headers     []Header     `json:"headers,omitempty"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

// SendResult is the response from a successful send.
type SendResult struct {
	ProviderMessageID string `json:"provider_message_id"`
	MessageID         string `json:"message_id"`
}

// Message is a simplified email for transactional sends (notifications, invites, etc.).
type Message struct {
	From    string      `json:"from"`
	To      []Recipient `json:"to"`
	Subject string      `json:"subject"`
	HTML    string      `json:"html"`
	Text    string      `json:"text"`
	ReplyTo string      `json:"reply_to,omitempty"`
}

// Sender can send simple transactional emails.
type Sender interface {
	Send(ctx context.Context, msg *Message) error
}

// FullSender can send rich emails with CC, BCC, attachments, and threading headers.
type FullSender interface {
	SendFull(ctx context.Context, req *SendRequest) (*SendResult, error)
}

// --- Singleton ---

var (
	instance *PostmarkSender
	once     sync.Once
	deliver  bool
)

func init() {
	deliver = !strings.EqualFold(os.Getenv("SKIP_SENDING_MAIL"), "true")
}

// Default returns the shared PostmarkSender (or nil if not configured).
func Default() *PostmarkSender {
	once.Do(func() {
		token := os.Getenv("POSTMARK_SERVER_TOKEN")
		from := os.Getenv("MAIL_FROM_ADDRESS")
		if from == "" {
			from = "noreply@tinycld.org"
		}
		if token != "" {
			instance = NewPostmarkSender(token, "", from)
		}
	})
	return instance
}

// DefaultSender returns a Sender, falling back to LogSender if no provider is configured.
// The PostmarkSender itself checks DELIVER_MAIL and logs instead of sending in dev mode.
func DefaultSender() Sender {
	s := Default()
	if s == nil {
		return &LogSender{}
	}
	return s
}

// NoopSender silently discards messages.
type NoopSender struct{}

func (n *NoopSender) Send(_ context.Context, _ *Message) error              { return nil }
func (n *NoopSender) SendFull(_ context.Context, _ *SendRequest) (*SendResult, error) {
	return &SendResult{}, nil
}

// LogSender prints emails to stdout instead of delivering them.
type LogSender struct{}

func (l *LogSender) Send(_ context.Context, msg *Message) error {
	fmt.Println("╭──────────────────────────────────────────────────────────╮")
	fmt.Println("│  EMAIL (not delivered — SKIP_SENDING_MAIL is set)   │")
	fmt.Println("├──────────────────────────────────────────────────────────┤")
	fmt.Printf("│  To:      %s\n", FormatRecipients(msg.To))
	if msg.From != "" {
		fmt.Printf("│  From:    %s\n", msg.From)
	}
	fmt.Printf("│  Subject: %s\n", msg.Subject)
	fmt.Println("├──────────────────────────────────────────────────────────┤")
	if msg.Text != "" {
		fmt.Println(msg.Text)
	} else {
		fmt.Println("(HTML only — no text body)")
	}
	fmt.Println("╰──────────────────────────────────────────────────────────╯")
	return nil
}

func (l *LogSender) SendFull(_ context.Context, req *SendRequest) (*SendResult, error) {
	fmt.Println("╭──────────────────────────────────────────────────────────╮")
	fmt.Println("│  EMAIL (not delivered — SKIP_SENDING_MAIL is set)   │")
	fmt.Println("├──────────────────────────────────────────────────────────┤")
	fmt.Printf("│  To:      %s\n", FormatRecipients(req.To))
	if len(req.Cc) > 0 {
		fmt.Printf("│  Cc:      %s\n", FormatRecipients(req.Cc))
	}
	if len(req.Bcc) > 0 {
		fmt.Printf("│  Bcc:     %s\n", FormatRecipients(req.Bcc))
	}
	if req.From != "" {
		fmt.Printf("│  From:    %s\n", req.From)
	}
	fmt.Printf("│  Subject: %s\n", req.Subject)
	if len(req.Attachments) > 0 {
		fmt.Printf("│  Attach:  %d file(s)\n", len(req.Attachments))
	}
	fmt.Println("├──────────────────────────────────────────────────────────┤")
	if req.TextBody != "" {
		fmt.Println(req.TextBody)
	} else {
		fmt.Println("(HTML only — no text body)")
	}
	fmt.Println("╰──────────────────────────────────────────────────────────╯")
	return &SendResult{MessageID: "dev-logged"}, nil
}
