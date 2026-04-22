'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentAccessToken } from '@/lib/authProfile';

type CurrentTicket = {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  expires_at: string;
};

type TicketMessage = {
  id: string;
  author_role_snapshot: string;
  message: string;
  created_at: string;
};

export default function SettingsPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [requestType, setRequestType] = useState('general');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [ticketMessage, setTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [currentTicket, setCurrentTicket] = useState<CurrentTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const token = await getCurrentAccessToken();
      setAccessToken(token);
      if (token) {
        const res = await fetch('/api/support/tickets', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          const ticket = ((data?.tickets ?? [])[0] ?? null) as CurrentTicket | null;
          setCurrentTicket(ticket);
          if (ticket) {
            const dRes = await fetch(`/api/support/tickets/${ticket.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const dData = await dRes.json();
            if (dRes.ok) setTicketMessages((dData?.messages ?? []) as TicketMessage[]);
          }
        }
      }
    };
    void boot();
  }, []);

  const refreshCurrentTicket = async () => {
    if (!accessToken) return;
    const res = await fetch('/api/support/tickets', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return;
    const ticket = ((data?.tickets ?? [])[0] ?? null) as CurrentTicket | null;
    setCurrentTicket(ticket);
    if (!ticket) {
      setTicketMessages([]);
      return;
    }
    const dRes = await fetch(`/api/support/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const dData = await dRes.json();
    if (dRes.ok) setTicketMessages((dData?.messages ?? []) as TicketMessage[]);
  };

  const submitPassword = async () => {
    if (!password || password.length < 6) {
      setPasswordMessage('Das Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordMessage('Die Passwort-Bestätigung stimmt nicht überein.');
      return;
    }
    setSavingPassword(true);
    setPasswordMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPasswordMessage(error.message);
    } else {
      setPassword('');
      setPasswordConfirm('');
      setPasswordMessage('Passwort wurde erfolgreich geändert.');
    }
    setSavingPassword(false);
  };

  const submitTicket = async () => {
    if (!accessToken) return;
    setCreatingTicket(true);
    setTicketMessage('');
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          request_type: requestType,
          priority: priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Ticket konnte nicht erstellt werden');
      setSubject('');
      setMessage('');
      setRequestType('general');
      setPriority('normal');
      setTicketMessage('Ticket wurde erfolgreich erstellt.');
      await refreshCurrentTicket();
    } catch (error: unknown) {
      setTicketMessage(error instanceof Error ? error.message : 'Ticket konnte nicht erstellt werden');
    } finally {
      setCreatingTicket(false);
    }
  };

  const sendReply = async () => {
    if (!accessToken || !currentTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${currentTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText('');
        await refreshCurrentTicket();
      }
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-sm">
            <h1 className="text-2xl font-semibold">Einstellungen</h1>
            <p className="mt-1 text-sm text-slate-200">
              Verwalte dein Passwort, erstelle Support-Tickets und verfolge den Verlauf.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Passwort ändern</h2>
              <p className="mt-1 text-sm text-gray-600">Verwende ein sicheres Passwort mit mindestens 6 Zeichen.</p>
              <div className="mt-4 grid gap-2 md:max-w-md">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Neues Passwort"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Neues Passwort bestätigen"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void submitPassword()}
                  disabled={savingPassword}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingPassword ? 'Speichern...' : 'Passwort aktualisieren'}
                </button>
                {passwordMessage ? <p className="text-sm text-slate-700">{passwordMessage}</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Support-Ticket erstellen</h2>
              <p className="mt-1 text-sm text-gray-600">
                Für eine Firmennamensänderung wähle den Typ <span className="font-medium">rename_company_request</span>.
              </p>
              <div className="mt-4 grid gap-2">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Betreff"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="general">allgemein</option>
                    <option value="rename_company_request">Firmenname ändern</option>
                  </select>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="low">niedrig</option>
                    <option value="normal">normal</option>
                    <option value="high">hoch</option>
                    <option value="urgent">dringend</option>
                  </select>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Beschreibung"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => void submitTicket()}
                  disabled={creatingTicket || !subject.trim() || !message.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {creatingTicket ? 'Senden...' : 'Ticket öffnen'}
                </button>
                {ticketMessage ? <p className="text-sm text-gray-700">{ticketMessage}</p> : null}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
            <p className="text-sm text-blue-900">
              Es wird nur dein aktuelles Ticket angezeigt. Geschlossene/alte Tickets bleiben nur im Superadmin-Bereich sichtbar.
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Aktuelles Ticket</h2>
            {!currentTicket ? (
              <p className="mt-2 text-sm text-gray-500">Kein aktives Ticket vorhanden.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{currentTicket.subject}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Status: {currentTicket.status} • Erstellt: {new Date(currentTicket.created_at).toLocaleString('de-DE')}
                  </p>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {ticketMessages.map((msg) => (
                    <div key={msg.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{msg.author_role_snapshot}</p>
                      <p>{msg.message}</p>
                    </div>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Antwort schreiben..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={sendingReply || !replyText.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {sendingReply ? 'Senden...' : 'Antwort senden'}
                </button>
              </div>
            )}
          </section>
        </div>
      </Layout>
    </AuthGuard>
  );
}
