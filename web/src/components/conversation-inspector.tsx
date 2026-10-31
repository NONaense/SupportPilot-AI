"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiUrl, getSupabaseClient } from "@/lib/supabase";

type Source = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  snippet: string;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
};

type MessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_mock?: boolean;
  created_at: string;
  sources: Source[];
};

type ConversationSummary = {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_question: string | null;
  last_answer: string | null;
  has_unanswered: boolean;
  is_visitor: boolean;
};

type WorkspaceMetrics = {
  workspace_id: string;
  conversations_count: number;
  messages_count: number;
  sourced_answers_percent: number;
  unanswered_count: number;
  documents_ready: number;
  is_demo_data: boolean;
};

type ConversationDetail = {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  is_visitor: boolean;
  messages: MessageItem[];
};

const UNKNOWN_ANSWER = "I don't know based on the available knowledge base. Please contact a human for help.";

export function ConversationInspector({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const [metrics, setMetrics] = useState<WorkspaceMetrics>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unanswered">("all");
  const [error, setError] = useState<string>();

  // Action states inside modal
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [savingFaq, setSavingFaq] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string>();

  async function sessionToken() {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    if (!session) throw new Error("Your session has ended. Please sign in again.");
    return session.access_token;
  }

  async function loadData() {
    try {
      const token = await sessionToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [metricsRes, convsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/metrics`, { headers }),
        fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/conversations`, { headers }),
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (convsRes.ok) setConversations(await convsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [workspaceId]);

  async function inspectConversation(convId: string) {
    setLoadingConv(true);
    setActionSuccess(undefined);
    setReplyText("");
    setShowFaqForm(false);
    try {
      const token = await sessionToken();
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const detail: ConversationDetail = await res.json();
        setSelectedConv(detail);

        // Pre-fill FAQ question from the last user question
        const userMsgs = detail.messages.filter((m) => m.role === "user");
        if (userMsgs.length > 0) {
          setFaqQuestion(userMsgs[userMsgs.length - 1].content);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not inspect conversation.");
    } finally {
      setLoadingConv(false);
    }
  }

  async function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConv || !replyText.trim() || sendingReply) return;

    setSendingReply(true);
    setActionSuccess(undefined);
    try {
      const token = await sessionToken();
      const res = await fetch(
        `${apiUrl}/api/v1/workspaces/${workspaceId}/conversations/${selectedConv.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: replyText.trim() }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to send reply.");
      }

      const updated: ConversationDetail = await res.json();
      setSelectedConv(updated);
      setReplyText("");
      setActionSuccess("Reply sent directly to the customer thread!");
      void loadData(); // refresh sidebar counts and badges
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleMarkResolved() {
    if (!selectedConv || resolving) return;

    setResolving(true);
    setActionSuccess(undefined);
    try {
      const token = await sessionToken();
      const res = await fetch(
        `${apiUrl}/api/v1/workspaces/${workspaceId}/conversations/${selectedConv.id}/resolve`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to resolve conversation.");
      }

      const updated: ConversationDetail = await res.json();
      setSelectedConv(updated);
      setActionSuccess("Conversation marked as resolved!");
      void loadData(); // refresh sidebar counts and badges
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not resolve conversation.");
    } finally {
      setResolving(false);
    }
  }

  async function handleSaveFaq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim() || savingFaq) return;

    setSavingFaq(true);
    try {
      const token = await sessionToken();
      const cleanSlug = faqQuestion.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
      const filename = `faq-${cleanSlug}-${Date.now().toString().slice(-4)}.md`;
      const content = `# Q: ${faqQuestion.trim()}\n\n${faqAnswer.trim()}\n`;

      const blob = new Blob([content], { type: "text/markdown" });
      const formData = new FormData();
      formData.append("file", blob, filename);

      // 1. Upload document
      const uploadRes = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to upload FAQ document.");
      }

      const uploadedDoc = await uploadRes.json();

      // 2. Trigger immediate re-index so Gemini embeds it right away
      await fetch(
        `${apiUrl}/api/v1/workspaces/${workspaceId}/documents/${uploadedDoc.id}/reindex`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setShowFaqForm(false);
      setFaqAnswer("");
      setActionSuccess(
        `Added "${filename}" to your knowledge base and indexed! SupportDock will now know how to answer this question.`
      );
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save to knowledge base.");
    } finally {
      setSavingFaq(false);
    }
  }

  const filteredConversations =
    activeTab === "all" ? conversations : conversations.filter((c) => c.has_unanswered);

  // Check if current open conversation needs attention
  const openConvNeedsAttention = Boolean(
    selectedConv &&
      selectedConv.messages.length > 0 &&
      selectedConv.messages.slice(-1)[0]?.role === "assistant" &&
      selectedConv.messages.slice(-1)[0]?.content === UNKNOWN_ANSWER
  );

  return (
    <div className="mt-8 space-y-6">
      {/* Real Live Database Metrics */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Workspace Health & Metrics</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            Live Database Telemetry
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="card p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Conversations</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
              {metrics ? metrics.conversations_count : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Total customer threads</p>
          </div>
          <div className="card p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Grounded Accuracy</p>
            <p className="mt-2 text-3xl font-extrabold text-teal-600 dark:text-teal-400">
              {metrics ? `${metrics.sourced_answers_percent}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Knowledge-anchored answers</p>
          </div>
          <div className="card p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Needs Human Follow-up</p>
            <p
              className={`mt-2 text-3xl font-extrabold ${
                metrics && metrics.unanswered_count > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {metrics ? metrics.unanswered_count : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Unanswered questions</p>
          </div>
          <div className="card p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Documents Indexed</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
              {metrics ? metrics.documents_ready : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Active knowledge sources</p>
          </div>
        </div>
      </section>

      {/* Public Chat Link Share Box */}
      <section className="card flex flex-col justify-between gap-4 border-teal-200 bg-gradient-to-r from-teal-50/50 via-white to-white p-5 sm:flex-row sm:items-center dark:border-teal-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
            Public Support Assistant
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
            Share your SupportDock with visitors and customers
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Visitors can chat with your knowledge base, refresh, and retrieve their conversations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/chat/${slug}`}
            target="_blank"
            className="button-primary !py-2.5 !text-xs whitespace-nowrap"
          >
            Open Public Chat ↗
          </Link>
        </div>
      </section>

      {/* Conversations List & Inspection */}
      <section className="card overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Conversations & Inquiries</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Inspect visitor dialogs, answer unanswered questions, and follow up directly.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === "all"
                  ? "bg-slate-900 text-white dark:bg-teal-600"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unanswered")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === "unanswered"
                  ? "bg-amber-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Needs Attention ({conversations.filter((c) => c.has_unanswered).length})
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && <p className="bg-rose-50 p-4 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">{error}</p>}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <p className="p-8 text-center text-xs text-slate-400">Loading conversations…</p>
          ) : filteredConversations.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No conversations recorded yet</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Ask a question using the test box or visit your public chat page.
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className="flex flex-col justify-between gap-3 p-5 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        conv.is_visitor
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
                          : "bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                      }`}
                    >
                      {conv.is_visitor ? "Visitor" : "Team Member"}
                    </span>
                    {conv.has_unanswered ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                        Needs Human Follow-up
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                        Resolved
                      </span>
                    )}
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(conv.updated_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-900 dark:text-white">
                    {conv.last_question ?? "Empty conversation"}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                    {conv.last_answer ?? "No response"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void inspectConversation(conv.id)}
                  disabled={loadingConv}
                  className="button-secondary !py-2 !text-xs whitespace-nowrap"
                >
                  Inspect & Reply ↗
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Conversation Detail Inspection & Action Modal */}
      {selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/80">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Conversation Manager
                  </p>
                  <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                    {selectedConv.is_visitor ? "Public Visitor" : "Team Member"} Thread
                  </h3>
                </div>
                {openConvNeedsAttention ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Needs Attention
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Resolved
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedConv(null)}
                className="rounded-lg p-2 text-xs font-bold text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                ✕ Close
              </button>
            </div>

            {/* Alert banner if attention needed */}
            {openConvNeedsAttention && (
              <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
                <span>⚠️ SupportDock could not answer the visitor&apos;s latest question.</span>
                <button
                  type="button"
                  onClick={() => void handleMarkResolved()}
                  disabled={resolving}
                  className="rounded-lg bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100"
                >
                  {resolving ? "Resolving…" : "✓ Mark Resolved"}
                </button>
              </div>
            )}

            {/* Success alert message */}
            {actionSuccess && (
              <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
                ✓ {actionSuccess}
              </div>
            )}

            {/* Modal Body: Full Transcript */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6 dark:bg-slate-950/30" style={{ maxHeight: "45vh" }}>
              {selectedConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-teal-600 px-4 py-3 text-sm text-white shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full max-w-[92%] rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[10px] text-white">
                          ✦
                        </span>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {msg.content.startsWith("[Resolved") || msg.content.startsWith("[Thread")
                            ? "SupportDock (Resolution)"
                            : "SupportDock"}
                        </p>
                        {msg.is_mock && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                            Mock
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
                        {msg.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Knowledge Base FAQ Accordion */}
            {showFaqForm && (
              <form
                onSubmit={handleSaveFaq}
                className="border-t border-slate-200 bg-teal-50/50 p-4 dark:border-slate-800 dark:bg-slate-850 dark:bg-slate-950/70"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-teal-800 dark:text-teal-300">
                    ➕ Save Answer to Knowledge Base (AI will remember it)
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowFaqForm(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={faqQuestion}
                    onChange={(e) => setFaqQuestion(e.target.value)}
                    placeholder="Question (e.g. Does rental income attract GST?)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <textarea
                    rows={2}
                    required
                    value={faqAnswer}
                    onChange={(e) => setFaqAnswer(e.target.value)}
                    placeholder="Type the verified answer here to index it permanently..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={savingFaq || !faqQuestion.trim() || !faqAnswer.trim()}
                    className="button-primary !py-1.5 !px-3 !text-xs disabled:opacity-50"
                  >
                    {savingFaq ? "Indexing into Knowledge Base…" : "Save & Index into Docs"}
                  </button>
                </div>
              </form>
            )}

            {/* Human Reply Composer Box */}
            <form
              onSubmit={handleSendReply}
              className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="agent-reply" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Reply as Support Agent:
                </label>
                {!showFaqForm && (
                  <button
                    type="button"
                    onClick={() => setShowFaqForm(true)}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                  >
                    ➕ Teach AI this answer
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  id="agent-reply"
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a human response to answer this visitor's question directly..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="button-primary !py-2 !px-4 !text-xs self-end disabled:opacity-50 whitespace-nowrap"
                >
                  {sendingReply ? "Sending…" : "Send Reply"}
                </button>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400">
              <span className="font-mono text-[11px] truncate max-w-[200px]">ID: {selectedConv.id}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleMarkResolved()}
                  disabled={resolving || !openConvNeedsAttention}
                  className="button-secondary !py-1.5 !text-xs disabled:opacity-40"
                  title="Mark thread as resolved without sending a reply"
                >
                  {resolving ? "Resolving…" : "✓ Mark Resolved"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
