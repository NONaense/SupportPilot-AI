"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/supabase";

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

export function ChatWidget({ slug }: { slug: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceInfo>();
  const [visitorId, setVisitorId] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize visitor ID & load workspace
  useEffect(() => {
    let vid = localStorage.getItem("supportdock_visitor_id");
    if (!vid) {
      vid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "v-" + Math.random().toString(36).substring(2, 12);
      localStorage.setItem("supportdock_visitor_id", vid);
    }
    setVisitorId(vid);

    async function init() {
      try {
        const wsRes = await fetch(`${apiUrl}/api/v1/public/workspaces/${slug}`);
        if (!wsRes.ok) return;
        const wsData: WorkspaceInfo = await wsRes.json();
        setWorkspace(wsData);

        const savedConvId = localStorage.getItem(`supportdock_conv_${slug}`);
        if (savedConvId) {
          setConversationId(savedConvId);
          try {
            const convRes = await fetch(`${apiUrl}/api/v1/public/workspaces/${slug}/conversations/${savedConvId}?visitor_id=${vid}`);
            if (convRes.ok) {
              const convData = await convRes.json();
              setMessages(convData.messages ?? []);
            }
          } catch {
            // Ignore stale conversation fetch error
          }
        }
      } catch {
        // Silently handle widget init failure
      }
    }

    void init();
  }, [slug]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isOpen]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading || !workspace) return;

    setError(undefined);
    setLoading(true);

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
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

  return (
    <aside aria-label="Support chat widget" className="fixed bottom-6 right-6 z-50">
      {/* Floating Chat Window */}
      {isOpen && (
        <section
          id="supportdock-widget-window"
          role="region"
          aria-label={`${workspace?.name ?? "Support"} chat dialog`}
          className="card mb-3 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-2xl transition-all sm:w-[400px]"
        >
          {/* Widget Header */}
          <header className="flex items-center justify-between border-b border-teal-700 bg-teal-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500 font-bold text-white text-xs">
                {workspace?.name.charAt(0).toUpperCase() ?? "S"}
              </span>
              <div>
                <h2 className="text-sm font-bold leading-tight">{workspace?.name ?? "SupportDock"}</h2>
                <p className="text-[11px] text-teal-100">Grounded Knowledge Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={startNewConversation}
                  className="rounded px-2 py-1 text-[11px] font-medium text-teal-100 hover:bg-teal-500 hover:text-white"
                  title="Start a new chat thread"
                >
                  New
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close support chat"
                className="grid h-8 w-8 place-items-center rounded-lg text-teal-100 hover:bg-teal-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              >
                ✕
              </button>
            </div>
          </header>

          {/* Messages Area */}
          <div
            tabIndex={0}
            role="log"
            aria-live="polite"
            className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 text-xs"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-700 text-lg">
                  ✦
                </span>
                <p className="mt-3 font-bold text-slate-800">Hi there! How can we help?</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Ask any question about our services, pricing, or policies.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-teal-600 px-3.5 py-2.5 text-white shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full max-w-[92%] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-teal-600 text-[8px] text-white">
                          ✦
                        </span>
                        <p className="text-[11px] font-bold text-slate-800">SupportDock</p>
                        {msg.is_mock && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                            Mock
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap leading-5 text-slate-700">
                        {msg.content}
                      </p>

                      {/* Source Citations */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2.5 border-t border-slate-100 pt-2">
                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Sources
                          </p>
                          <div className="mt-1 space-y-1">
                            {msg.sources.map((src) => (
                              <article
                                key={src.chunk_id}
                                className="rounded border border-teal-100 bg-teal-50/50 p-1.5 text-[10px]"
                              >
                                <p className="font-bold text-teal-800">
                                  ↗ {src.document_name}
                                  {src.page_number ? ` · p. ${src.page_number}` : ""}
                                </p>
                                <p className="mt-0.5 text-slate-600">{src.snippet}</p>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Loading typing indicator */}
            {loading && (
              <div className="flex items-start">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-1.5" aria-busy="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600" />
                    <span className="ml-1 text-[10px] text-slate-400">Searching docs…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Error Message */}
          {error && (
            <div role="alert" className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {error}
            </div>
          )}

          {/* Chat Input */}
          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 bg-white p-2.5">
            <label htmlFor="widget-chat-input" className="sr-only">
              Type your question
            </label>
            <input
              ref={inputRef}
              id="widget-chat-input"
              type="text"
              required
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-teal-500"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="button-primary !px-3.5 !py-2 !text-xs disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>
      )}

      {/* Floating Launcher Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="supportdock-widget-window"
          aria-label={isOpen ? "Close support chat" : "Open support chat"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-xl transition-all duration-200 hover:scale-105 hover:bg-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-200"
        >
          {isOpen ? (
            <span className="text-xl font-bold">✕</span>
          ) : (
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
}
