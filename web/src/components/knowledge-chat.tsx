"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiUrl, getSupabaseClient } from "@/lib/supabase";

type Workspace = { id: string; name: string };
type Source = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  snippet: string;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_mock?: boolean;
  sources?: Source[];
};

export function KnowledgeChat({ workspace }: { workspace: Workspace }) {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  // Restore conversation if saved
  useEffect(() => {
    const saved = localStorage.getItem(`supportdock_admin_conv_${workspace.id}`);
    if (saved) setConversationId(saved);
  }, [workspace.id]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(undefined);

    const tempUserMsg: ChatMessage = {
      id: "user-" + Date.now(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setQuestion("");

    try {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();
      if (!session) throw new Error("Your session has ended. Please sign in again.");

      const response = await fetch(`${apiUrl}/api/v1/workspaces/${workspace.id}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question: trimmed, conversation_id: conversationId }),
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.detail ?? "Could not answer that question.");
      }

      const data = await response.json();
      setConversationId(data.conversation_id);
      localStorage.setItem(`supportdock_admin_conv_${workspace.id}`, data.conversation_id);

      const asstMsg: ChatMessage = {
        id: "asst-" + Date.now(),
        role: "assistant",
        content: data.answer,
        is_mock: data.is_mock,
        sources: data.sources ?? [],
      };
      setMessages((prev) => [...prev, asstMsg]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not answer that question.");
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    setConversationId(undefined);
    localStorage.removeItem(`supportdock_admin_conv_${workspace.id}`);
  }

  return (
    <section className="mt-7 card overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white p-5 sm:p-6 dark:border-slate-800 dark:from-slate-800/80 dark:to-slate-900">
        <div>
          <p className="eyebrow">Internal Knowledge Test</p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">
            Ask {workspace.name}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Verify RAG responses directly against your indexed documents.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear chat
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6 dark:bg-slate-950/20">
        {messages.length > 0 && (
          <div className="mb-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-xl bg-slate-800 px-4 py-2.5 text-sm text-white dark:bg-slate-700">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full max-w-[90%] rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/90">
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-600 text-[10px] text-white">
                        ✦
                      </span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">SupportDock</p>
                      {msg.is_mock && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          Mock response
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {msg.content}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600" />
            <span>Searching indexed chunks…</span>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
          >
            {error}
          </p>
        )}

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={ask}>
          <label className="sr-only" htmlFor="knowledge-question">
            Ask a question
          </label>
          <input
            id="knowledge-question"
            maxLength={2000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            placeholder="e.g. As a transporter, what records do I need to maintain?"
          />
          <button
            className="button-primary disabled:opacity-60"
            disabled={loading || !question.trim()}
          >
            {loading ? "Searching…" : "Ask"}
          </button>
        </form>
      </div>
    </section>
  );
}
