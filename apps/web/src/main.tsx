import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { parseCsv, type CsvIssue } from "./lead-parser";

type User = { id: string; name: string; email: string; avatarUrl?: string };
type Sender = { id: string; email: string; displayName: string };
type Email = {
  id: string;
  recipient: string;
  subject: string;
  scheduledAt?: string;
  sentAt?: string;
  status: string;
  previewUrl?: string | null;
};
type SlackStatus = { connected: boolean; connection?: { workspaceName?: string | null } | null };
const api = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [user, setUser] = useState<User>();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [tab, setTab] = useState<"scheduled" | "sent">("scheduled");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [manualRecipients, setManualRecipients] = useState<string[]>([]);
  const [csvRecipients, setCsvRecipients] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delay, setDelay] = useState("2000");
  const [limit, setLimit] = useState("200");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [slack, setSlack] = useState<SlackStatus>({ connected: false });
  const [cancellingId, setCancellingId] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [csvSummary, setCsvSummary] = useState<{ duplicates: number; invalidRows: CsvIssue[]; error?: string }>();
  const parseManual = (text: string) => { const parsed = [...new Set(text.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/g)?.map((email) => email.toLowerCase()) ?? [])]; setManualRecipients(parsed); setRecipients([...new Set([...parsed, ...csvRecipients])]); setCsvSummary(undefined); };
  const parseFile = (text: string) => { const result = parseCsv(text); setCsvRecipients(result.recipients); setRecipients([...new Set([...manualRecipients, ...result.recipients])]); setCsvSummary({ duplicates: result.duplicates, invalidRows: result.invalidRows, error: result.error }); };
  const clearCsv = () => { setCsvRecipients([]); setRecipients(manualRecipients); setCsvSummary(undefined); if (fileInput.current) fileInput.current.value = ""; };
  const load = async () => {
    setLoading(true);
    const [me, senderResponse, emailResponse, slackResponse] = await Promise.all([
      fetch(`${api}/api/auth/me`, { credentials: "include" }),
      fetch(`${api}/api/senders`, { credentials: "include" }),
      fetch(`${api}/api/emails/${tab}`, { credentials: "include" }),
      fetch(`${api}/api/slack/status`, { credentials: "include" }),
    ]);
    const unauthorized = [me, senderResponse, emailResponse, slackResponse].some((response) => response.status === 401);
    setSessionExpired(unauthorized);
    if (unauthorized) { setEmails([]); setSenders([]); }
    if (me.ok) setUser((await me.json()).user);
    if (senderResponse.ok) {
      const data = (await senderResponse.json()).senders as Sender[];
      setSenders(data);
      setSenderId((current) => current || data[0]?.id || "");
    }
    if (emailResponse.ok) setEmails((await emailResponse.json()).emails);
    if (slackResponse.ok) setSlack(await slackResponse.json());
    setLoading(false);
  };
  const disconnectSlack = async () => {
    const response = await fetch(`${api}/api/slack/disconnect`, { method: "POST", credentials: "include" });
    if (response.ok) { setSlack({ connected: false }); setNotice("Slack disconnected."); }
    else setNotice("Could not disconnect Slack.");
  };
  useEffect(() => {
    void load();
  }, [tab]);
  const createSender = async () => {
    const response = await fetch(`${api}/api/senders`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: senderName, email: senderEmail }),
    });
    if (!response.ok) return setNotice("Could not create sender.");
    const sender = (await response.json()).sender as Sender;
    setSenders((items) => [...items, sender]);
    setSenderId(sender.id);
    setSenderName("");
    setSenderEmail("");
    setNotice("Sender created.");
  };
  const schedule = async () => {
    if (!senderId || !recipients.length || !subject || !body || !startTime)
      return setNotice(
        "Complete sender, recipients, subject, body, and start time.",
      );
    const response = await fetch(`${api}/api/emails/schedule`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        senderId,
        recipients,
        subject,
        body,
        startTime: new Date(startTime).toISOString(),
        delayBetweenEmailsMs: Number(delay),
        hourlyLimit: Number(limit),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setNotice(
      response.ok
        ? `${recipients.length} emails scheduled.`
        : "Scheduling failed.",
    );
    if (response.ok) void load();
  };
  const cancelEmail = async (id: string) => {
    if (!window.confirm("Cancel this scheduled email?")) return;
    setCancellingId(id);
    const response = await fetch(`${api}/api/emails/${id}/cancel`, { method: "POST", credentials: "include" });
    setCancellingId(undefined);
    if (response.ok) { setNotice("Email cancelled."); void load(); }
    else setNotice("Could not cancel this email.");
  };
  return (
    <div className="app">
      <div className="workspace">
      <header>
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>Email scheduler</h1>
        </div>
        <div className="profile">
          {user?.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt="" /> : <div className="avatar">{user?.name?.[0] ?? "?"}</div>}
          <div>
            {user ? <><strong>{user.name}</strong><small>{user.email}</small></> : <button className="sign-in" onClick={() => { window.location.href = `${api}/api/auth/google`; }}>Sign in with Google</button>}
          </div>
          {user && <button
            onClick={() =>
              void fetch(`${api}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
              }).then(() => { setUser(undefined); void load(); })
            }
          >
            Log out
          </button>}
        </div>
      </header>
      <main>
        {user && <section className="integration panel"><div><div className="section-label">INTEGRATIONS</div><strong>Slack notifications</strong><p className="muted">Get notified when a sender reaches its hourly limit.</p></div>{slack.connected ? <div className="integration-actions"><span className="connected">Connected{slack.connection?.workspaceName ? ` · ${slack.connection.workspaceName}` : ""}</span><button onClick={() => void disconnectSlack()}>Disconnect</button></div> : <button className="secondary" onClick={() => { window.location.href = `${api}/api/slack/connect`; }}>Connect Slack</button>}</section>}
        <section id="compose" className="panel compose">
          <h2>Compose new email</h2>
          <p className="lead">Send an email to your recipients</p>
          <div className="form-section">
            <div className="section-label">SENDER</div>
          <div className="grid">
            <label>
              New sender name
              <input
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
              />
            </label>
            <label>
              New sender email
              <input
                type="email"
                value={senderEmail}
                onChange={(event) => setSenderEmail(event.target.value)}
              />
            </label>
            <button className="primary" onClick={() => void createSender()}>
              Add sender
            </button>
          </div>
          <label>
            Sender
            <select
              value={senderId}
              onChange={(event) => setSenderId(event.target.value)}
            >
              <option value="">Select a sender</option>
              {senders.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.displayName} · {sender.email}
                </option>
              ))}
            </select>
          </label>
          </div>
          <div className="form-section">
            <div className="section-label">RECIPIENTS</div>
          <label>
            CSV or text file
            <input
              type="file"
              ref={fileInput}
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) =>
                void event.target.files?.[0]?.text().then(parseFile)
              }
            />
          </label>
          <label>
            Recipients
            <textarea
              className="recipients"
              value={manualRecipients.join(", ")}
              placeholder="Paste emails or CSV text"
              onChange={(event) => parseManual(event.target.value)}
            />
          </label>
          <p className="muted">
            {recipients.length} valid unique email
            {recipients.length === 1 ? "" : "s"} detected
          </p>
          {csvSummary && <div className="csv-summary"><div className="csv-summary-head"><strong>{csvSummary.error ? "CSV could not be processed" : "CSV processed"}</strong><button type="button" className="clear-csv" onClick={clearCsv}>Remove CSV</button></div>{csvSummary.error ? <span className="csv-error">{csvSummary.error}</span> : <><span>✓ {csvRecipients.length} valid unique recipient{csvRecipients.length === 1 ? "" : "s"}</span>{csvSummary.duplicates > 0 && <span>↻ {csvSummary.duplicates} duplicate{csvSummary.duplicates === 1 ? "" : "s"} removed</span>}{csvSummary.invalidRows.length > 0 && <span className="csv-error">⚠ {csvSummary.invalidRows.length} invalid row{csvSummary.invalidRows.length === 1 ? "" : "s"}</span>}{csvSummary.invalidRows.map((issue) => <small className="csv-error" key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</small>)}</>}</div>}
          </div>
          <div className="form-section">
            <div className="section-label">MESSAGE</div>
          <label>
            Subject
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label>
            Body
            <textarea
              className="message"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          </div>
          <div className="form-section">
            <div className="section-label">SCHEDULE</div>
          <div className="grid">
            <label>
              Start time
              <input
              type="datetime-local"
              className="schedule-time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label>
              Delay (ms)
              <input
              type="number"
              className="schedule-number"
                value={delay}
                onChange={(event) => setDelay(event.target.value)}
              />
              <span className="helper">Delay between each email</span>
            </label>
            <label>
              Hourly limit
              <input
              type="number"
              className="schedule-number"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
              <span className="helper">Maximum emails allowed per hour</span>
            </label>
          </div>
          </div>
          <button className="primary" onClick={() => void schedule()}>
            Schedule emails
          </button>
          {notice && <p className="notice">{notice}</p>}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>{tab === "scheduled" ? "Scheduled emails" : "Sent emails"}</h2>
            <div className="tabs">
              <button
                className={tab === "scheduled" ? "active" : ""}
                onClick={() => setTab("scheduled")}
              >
                Scheduled
              </button>
              <button
                className={tab === "sent" ? "active" : ""}
                onClick={() => setTab("sent")}
              >
                Sent
              </button>
            </div>
          </div>
          {sessionExpired ? (
            <div className="empty error-state"><strong>Session expired</strong><span>Sign in again to view your emails.</span><button className="sign-in" onClick={() => { window.location.href = `${api}/api/auth/google`; }}>Sign in with Google</button></div>
          ) : loading ? (
            <div className="empty">Loading…</div>
          ) : emails.length ? (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Subject</th>
                  <th>
                    {tab === "scheduled" ? "Scheduled time" : "Sent time"}
                  </th>
                  <th>Status</th>
                  {tab === "scheduled" && <th>Actions</th>}
                  {tab === "sent" && <th>Preview</th>}
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td>{email.recipient}</td>
                    <td>{email.subject}</td>
                    <td>
                      {new Date(
                        tab === "scheduled"
                          ? email.scheduledAt!
                          : email.sentAt!,
                      ).toLocaleString()}
                    </td>
                    <td>{email.status}</td>
                    {tab === "scheduled" && <td><button className="table-action" disabled={cancellingId === email.id} onClick={() => void cancelEmail(email.id)}>{cancellingId === email.id ? "Cancelling…" : "Cancel"}</button></td>}
                    {tab === "sent" && (
                      <td>
                        {email.previewUrl ? (
                          <a href={email.previewUrl} target="_blank" rel="noreferrer">
                            View preview
                          </a>
                        ) : (
                          <span className="muted">Unavailable</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No {tab} emails yet.</div>
          )}
        </section>
      </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
