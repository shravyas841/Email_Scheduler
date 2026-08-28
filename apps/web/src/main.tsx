import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Email = { id: string; recipient: string; subject: string; scheduledAt?: string; sentAt?: string; status: string };
type User = { id: string; name: string; email: string; avatarUrl?: string };
type Sender = { id: string; email: string; displayName: string };
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const api = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function App() {
  const [tab, setTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTime, setStartTime] = useState('');
  const [delay, setDelay] = useState('2000');
  const [limit, setLimit] = useState('200');
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState<User>(); const [senders, setSenders] = useState<Sender[]>([]); const [senderId, setSenderId] = useState(''); const [rows, setRows] = useState<Email[]>([]); const [loading, setLoading] = useState(true);

  useEffect(() => { Promise.all([fetch(`${api}/api/auth/me`, { credentials: 'include' }), fetch(`${api}/api/senders`, { credentials: 'include' })]).then(async ([userResponse, senderResponse]) => { if (userResponse.ok) setUser((await userResponse.json()).user); if (senderResponse.ok) { const data = (await senderResponse.json()).senders as Sender[]; setSenders(data); setSenderId(data[0]?.id ?? ''); } }).finally(() => setLoading(false)); }, []);
  useEffect(() => { setLoading(true); fetch(`${api}/api/emails/${tab}`, { credentials: 'include' }).then(async (response) => { if (response.ok) setRows((await response.json()).emails); }).finally(() => setLoading(false)); }, [tab]);

  const parseLeads = (value: string) => setRecipients([...new Set(value.match(emailPattern)?.map((email) => email.toLowerCase()) ?? [])]);
  const schedule = async () => {
    setNotice('');
    if (!recipients.length || !subject || !body || !startTime) { setNotice('Add recipients, subject, body, and a start time.'); return; }
    setNotice('Scheduling…');
    const response = await fetch(`${api}/api/emails/schedule`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipients, subject, body, startTime: new Date(startTime).toISOString(), delayBetweenEmailsMs: Number(delay), hourlyLimit: Number(limit), idempotencyKey: crypto.randomUUID(), senderId }) });
    setNotice(response.ok ? `${recipients.length} emails scheduled.` : 'Scheduling failed. Check your sender and login.');
  };
  return <div className="app"><header><div><span className="eyebrow">REACHINBOX</span><h1>Email scheduler</h1></div><div className="profile"><div className="avatar">{user?.name?.[0] ?? '?'}</div><div><strong>{user?.name ?? 'Sign in required'}</strong><small>{user?.email ?? ''}</small></div><button onClick={() => fetch(`${api}/api/auth/logout`, { method: 'POST', credentials: 'include' })}>Log out</button></div></header><main><section className="panel compose"><h2>Compose new email</h2><label>Sender<select value={senderId} onChange={(event) => setSenderId(event.target.value)}><option value="">Select a sender</option>{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} · {sender.email}</option>)}</select></label><label>Recipients<textarea placeholder="Paste emails or CSV text" onChange={(event) => parseLeads(event.target.value)} /></label><p className="muted">{recipients.length} valid unique email{recipients.length === 1 ? '' : 's'} detected</p><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>Body<textarea value={body} onChange={(event) => setBody(event.target.value)} /></label><div className="grid"><label>Start time<input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Delay (ms)<input type="number" value={delay} onChange={(event) => setDelay(event.target.value)} /></label><label>Hourly limit<input type="number" value={limit} onChange={(event) => setLimit(event.target.value)} /></label></div><button className="primary" onClick={schedule}>Schedule emails</button>{notice && <p className="notice">{notice}</p>}</section><section className="panel"><div className="section-head"><div><span className="eyebrow">ACTIVITY</span><h2>{tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}</h2></div><div className="tabs"><button className={tab === 'scheduled' ? 'active' : ''} onClick={() => setTab('scheduled')}>Scheduled</button><button className={tab === 'sent' ? 'active' : ''} onClick={() => setTab('sent')}>Sent</button></div></div>{loading ? <div className="empty">Loading…</div> : rows.length ? <table><tbody>{rows.map((row) => <tr key={row.id}><td>{row.recipient}</td><td>{row.subject}</td><td>{row.status}</td></tr>)}</tbody></table> : <div className="empty">No {tab} emails yet.</div>}</section></main></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
