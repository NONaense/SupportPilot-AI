"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/supabase";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

type Source = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  snippet: string;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_mock?: boolean;
  created_at?: string;
  sources?: Source[];
};

type WorkspaceInfo = {
  id: string;
  name: string;
  slug: string;
};

export function PublicChat({ slug }: { slug: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceInfo>();
  const [visitorId, setVisitorId] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize visitor ID & load workspace
  useEffect(() => {
    let vid = localStorage.getItem("supportdock_visitor_id");
    if (!vid) {
      vid =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "v-" + Math.random().toString(36).substring(2, 12);
      localStorage.setItem("supportdock_visitor_id", vid);
    }
    setVisitorId(vid);

    async function init() {
      try {
        const wsRes = await fetch(`${apiUrl}/api/v1/public/workspaces/${slug}`);
        if (!wsRes.ok) {
          throw new Error("This support workspace was not found or is currently unavailable.");
        }
        const wsData: WorkspaceInfo = await wsRes.json();
        setWorkspace(wsData);

        // Check if there is an existing conversation session
        const savedConvId = localStorage.getItem(`supportdock_conv_${slug}`);
        if (savedConvId) {
          const convRes = await fetch(
            `${apiUrl}/api/v1/public/workspaces/${slug}/conversations/${savedConvId}?visitor_id=${encodeURIComponent(
              vid || ""
            )}`
          );
          if (convRes.ok) {
            const convData = await convRes.json();
            setConversationId(convData.id);
            setMessages(
              (convData.messages ?? []).map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                is_mock: m.is_mock,
                created_at: m.created_at,
                sources: m.sources ?? [],
              }))
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load support dock.");
      } finally {
        setInitialLoading(false);
      }
    }

    void init();
  }, [slug]);

  // Auto-scroll when messages update
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setError(undefined);
    setLoading(true);

    const userMsg: Message = {
      id: "usr-" + Date.now(),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");

    try {
      const response = await fetch(`${apiUrl}/api/v1/public/workspaces/${slug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          conversation_id: conversationId,
          visitor_id: visitorId,
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.detail ?? "Could not send message.");
      }

      const data = await response.json();
      const newConvId = data.conversation_id;
      setConversationId(newConvId);
      localStorage.setItem(`supportdock_conv_${slug}`, newConvId);

      const assistantMsg: Message = {
        id: "asst-" + Date.now(),
        role: "assistant",
        content: data.answer,
        is_mock: data.is_mock,
        created_at: new Date().toISOString(),
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get an answer.");
    } finally {
      setLoading(false);
    }
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    localStorage.removeItem(`supportdock_conv_${slug}`);
  }

  if (initialLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist p-6 dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Connecting to {slug} support dock…
        </p>
      </main>
    );
  }

  if (error && !workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist p-6 dark:bg-slate-950">
        <div className="card max-w-md p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-lg font-bold text-slate-900 dark:text-white">Workspace Unavailable</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <Link href="/" className="button-secondary mt-5">
            Return home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-mist transition-colors dark:bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white transition-colors dark:border-slate-800 dark:bg-slate-900">
        <div className="shell flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 font-bold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
              {workspace?.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                {workspace?.name} Support
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grounded knowledge base assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNewConversation}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                + New chat
              </button>
            )}
            <ThemeToggle />
            <Brand />
          </div>
        </div>
      </header>

      {/* Chat Conversation Area */}
      <div className="shell flex flex-1 flex-col py-6">
        <div className="card flex flex-1 flex-col overflow-hidden transition-colors dark:border-slate-800 dark:bg-slate-900">
          {/* Top banner */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
            Answers are grounded in {workspace?.name}’s approved documentation.
          </div>

          {/* Messages list */}
          <div
            className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6 dark:bg-slate-950/30"
            style={{ minHeight: "420px" }}
          >
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-600 dark:bg-teal-950/70 dark:text-teal-400">
                  ✦
                </span>
                <p className="mt-4 font-bold text-slate-800 dark:text-slate-100">
                  How can we help you today?
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Ask any question about {workspace?.name}’s services, hours, or policies.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-teal-600 px-4 py-3 text-sm text-white shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full max-w-[92%] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:max-w-[82%] dark:border-slate-800 dark:bg-slate-800/90">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[10px] text-white">
                          ✦
                        </span>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          SupportDock
                        </p>
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
              ))
            )}

            {/* Loading typing indicator */}
            {loading && (
              <div className="flex items-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600" />
                    <span className="ml-1 text-xs text-slate-400 dark:text-slate-400">
                      Searching knowledge base…
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Error notice */}
          {error && (
            <div className="border-t border-rose-100 bg-rose-50 px-5 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Chat input box */}
          <form
            onSubmit={submit}
            className="flex gap-2 border-t border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="text"
              required
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask ${workspace?.name} a question…`}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="button-primary disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
