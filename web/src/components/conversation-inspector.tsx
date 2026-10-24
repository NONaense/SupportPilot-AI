"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export function ConversationInspector({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const [metrics, setMetrics] = useState<WorkspaceMetrics>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unanswered">("all");
  const [error, setError] = useState<string>();

  async function loadData() {
    try {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();
      if (!session) return;

      const headers = { Authorization: `Bearer ${session.access_token}` };

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
    try {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setSelectedConv(await res.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not inspect conversation.");
    } finally {
      setLoadingConv(false);
    }
  }

  const filteredConversations =
    activeTab === "all" ? conversations : conversations.filter((c) => c.has_unanswered);

  return (
    <div className="mt-8 space-y-6">
      {/* Real Live Database Metrics */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">Workspace Health & Metrics</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
            Live Database Telemetry
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Total Conversations</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {metrics ? metrics.conversations_count : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Total customer threads</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Sourced Answers</p>
            <p className="mt-2 text-3xl font-extrabold text-teal-600">
              {metrics ? `${metrics.sourced_answers_percent}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Grounded with citations</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Needs Human Follow-up</p>
            <p className={`mt-2 text-3xl font-extrabold ${metrics && metrics.unanswered_count > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {metrics ? metrics.unanswered_count : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Unanswered questions</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Documents Indexed</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {metrics ? metrics.documents_ready : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Active knowledge sources</p>
          </div>
        </div>
      </section>

      {/* Public Chat Link Share Box */}
      <section className="card flex flex-col justify-between gap-4 border-teal-200 bg-gradient-to-r from-teal-50/50 via-white to-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
            Public Support Widget
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            Share your SupportDock with visitors and customers
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
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
      <section className="card overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Conversations & Inquiries</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Inspect visitor dialogs, grounded citations, and unanswered topics.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                activeTab === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unanswered")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                activeTab === "unanswered"
                  ? "bg-amber-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Needs Attention ({conversations.filter((c) => c.has_unanswered).length})
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && <p className="bg-rose-50 p-4 text-xs text-rose-700">{error}</p>}

        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="p-8 text-center text-xs text-slate-400">Loading conversations…</p>
          ) : filteredConversations.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-bold text-slate-700">No conversations recorded yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Ask a question using the test box or visit your public chat page.
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className="flex flex-col justify-between gap-3 p-5 transition hover:bg-slate-50/60 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        conv.is_visitor
                          ? "bg-blue-50 text-blue-700"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      {conv.is_visitor ? "Visitor" : "Team Member"}
                    </span>
                    {conv.has_unanswered && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        Needs Human Follow-up
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(conv.updated_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-900">
                    {conv.last_question ?? "Empty conversation"}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                    {conv.last_answer ?? "No response"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void inspectConversation(conv.id)}
                  disabled={loadingConv}
                  className="button-secondary !py-2 !text-xs whitespace-nowrap"
                >
                  Inspect dialog ↗
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Conversation Detail Inspection Modal */}
      {selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Conversation Inspection
                </p>
                <h3 className="mt-0.5 text-base font-bold text-slate-900">
                  {selectedConv.is_visitor ? "Public Visitor" : "Team Member"} Thread
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConv(null)}
                className="rounded-lg p-2 text-xs font-bold text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body: Full Transcript */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6" style={{ maxHeight: "60vh" }}>
              {selectedConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-4 py-3 text-sm text-white">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full max-w-[92%] rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[10px] text-white">
                          ✦
                        </span>
                        <p className="text-xs font-bold text-slate-800">SupportDock</p>
                        {msg.is_mock && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Mock response
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {msg.content}
                      </p>

                      {/* Cited Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            Supporting Citations
                          </p>
                          <div className="mt-1.5 space-y-1.5">
                            {msg.sources.map((src) => (
                              <article
                                key={src.chunk_id}
                                className="rounded-lg border border-teal-100 bg-white p-2.5 text-xs"
                              >
                                <p className="font-bold text-teal-800">
                                  ↗ {src.document_name}
                                  {src.page_number
                                    ? ` · Page ${src.page_number}`
                                    : src.section_title
                                    ? ` · ${src.section_title}`
                                    : ""}
                                </p>
                                <p className="mt-1 text-[11px] leading-4 text-slate-600">
                                  {src.snippet}
                                </p>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500">
              <span>ID: {selectedConv.id}</span>
              <button
                type="button"
                onClick={() => setSelectedConv(null)}
                className="button-secondary !py-1.5 !text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
