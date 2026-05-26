import * as fs from 'node:fs'
import * as path from 'node:path'

// The Go LogSender appends one JSON object per line ("JSONL") to whatever
// path TINYCLD_EMAIL_LOG points at. app/playwright.config.ts sets this
// to `app/tmp/emails.log` for the webServer process AND exports it via
// webServer.env so PB (spawned by dev.ts) writes there; the test process
// also inherits it from the launching shell so both ends agree on one
// path. The relative fallback covers the unusual case of a test runner
// invoking this helper without the env var (e.g. a one-off `node` repl)
// and assumes the drive checkout sits next to the app checkout under
// ~/code/tinycld/.
const EMAIL_LOG_PATH =
    process.env.TINYCLD_EMAIL_LOG ??
    path.resolve(import.meta.dirname, '..', '..', 'app', 'tmp', 'emails.log')

export interface CapturedEmail {
    timestamp: string
    to: { name?: string; email: string }[]
    cc?: { name?: string; email: string }[]
    bcc?: { name?: string; email: string }[]
    from?: string
    subject: string
    text?: string
    html?: string
    attachments?: number
}

function readEmailLog(): CapturedEmail[] {
    if (!fs.existsSync(EMAIL_LOG_PATH)) return []
    const raw = fs.readFileSync(EMAIL_LOG_PATH, 'utf8')
    return raw
        .split('\n')
        .filter(l => l.trim().length > 0)
        .map(l => JSON.parse(l) as CapturedEmail)
}

export interface ReadOtpEmailOptions {
    timeoutMs?: number
}

// readLatestOtpEmail polls the JSONL email log every 200ms until it finds
// an entry addressed to `toEmail` whose subject matches the share-OTP
// subject pattern emitted by drive/server/endpoints_share_otp.go
// (sendShareOTPEmail formats `Your code to comment on %q`, where %q is the
// item name — we match on the stable "Your code to comment on" prefix).
// Returns the 6-digit code (parsed from the email body via /\b\d{6}\b/).
// Throws on timeout.
export async function readLatestOtpEmail(
    toEmail: string,
    { timeoutMs = 10_000 }: ReadOtpEmailOptions = {}
): Promise<{ code: string; subject: string; raw: CapturedEmail }> {
    const start = Date.now()
    const target = toEmail.toLowerCase()
    // The OTP subject template lives in core/server/mailer at send time but
    // the literal copy is owned by drive/server/endpoints_share_otp.go:
    //   subject := fmt.Sprintf("Your code to comment on %q", itemName)
    // We match on the stable prefix only — the item name embedded in %q is
    // collision-proof (each test mints a uniquely-named drive_items row),
    // but the per-test variation would force callers to know the doc name.
    const otpSubjectPattern = /^Your code to comment on /

    while (Date.now() - start < timeoutMs) {
        // readLatestOtpEmail is called once per scenario; the log file is
        // small (one entry per minted OTP across the whole run). Re-read in
        // full each tick rather than tailing — simpler, and the disk cost
        // is negligible against the network round-trip we're waiting on.
        const entries = readEmailLog()
        // Walk newest-to-oldest so concurrent scenarios using different
        // email addresses don't race; we want the latest OTP for THIS
        // recipient regardless of when other scenarios sent theirs.
        for (let i = entries.length - 1; i >= 0; i--) {
            const e = entries[i]
            if (!otpSubjectPattern.test(e.subject)) continue
            const matchesRecipient = e.to.some(r => r.email.toLowerCase() === target)
            if (!matchesRecipient) continue
            const body = `${e.text ?? ''}\n${e.html ?? ''}`
            const codeMatch = body.match(/\b(\d{6})\b/)
            if (!codeMatch) {
                throw new Error(
                    `OTP email to ${toEmail} did not contain a 6-digit code.\n` +
                        `Subject: ${e.subject}\nBody:\n${body}`
                )
            }
            return { code: codeMatch[1], subject: e.subject, raw: e }
        }
        await new Promise(r => setTimeout(r, 200))
    }

    const seen = readEmailLog()
        .map(e => `  to=${e.to.map(t => t.email).join(',')} subject=${e.subject}`)
        .join('\n')
    throw new Error(
        `Timed out after ${timeoutMs}ms waiting for OTP email to ${toEmail}.\n` +
            `Emails seen so far:\n${seen || '  (none)'}`
    )
}
