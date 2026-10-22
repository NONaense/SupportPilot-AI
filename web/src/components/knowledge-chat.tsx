"use client";

import { FormEvent, useState } from "react";
import { apiUrl, getSupabaseClient } from "@/lib/supabase";

type Workspace = { id: string; name: string };
type Source = { chunk_id: string; document_id: string; document_name: string; snippet: string; page_number: number | null; section_title: string | null; similarity: number };
type Reply = { answer: string; conversation_id: string; sources: Source[]; supported: boolean; is_mock: boolean; provider: string };

export function KnowledgeChat({ workspace }: { workspace: Workspace }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<Reply>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setLoading(true); setError(undefined);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) throw new Error("Your session has ended. Please sign in again.");
      const response = await fetch(`${apiUrl}/api/v1/workspaces/${workspace.id}/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ question: trimmed, conversation_id: reply?.conversation_id }) });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not answer that question.");
      setReply(await response.json()); setQuestion("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not answer that question."); }
    finally { setLoading(false); }
  }

  return <section className="mt-7 card overflow-hidden"><div className="border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white p-5 sm:p-6"><p className="eyebrow">Grounded knowledge chat</p><h2 className="mt-3 text-xl font-extrabold">Ask {workspace.name}</h2><p className="mt-1 text-sm leading-6 text-slate-600">Answers use only indexed workspace documents. If evidence is missing, SupportDock will say so.</p></div><div className="p-5 sm:p-6">{reply && <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-teal-600 text-xs text-white">✦</span><p className="text-sm font-bold">SupportDock</p>{reply.is_mock && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Mock response</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{reply.answer}</p>{reply.sources.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Sources</p><div className="mt-2 space-y-2">{reply.sources.map((source) => <article className="rounded-lg border border-teal-100 bg-white p-3" key={source.chunk_id}><p className="text-sm font-bold text-teal-800">↗ {source.document_name}{source.page_number ? ` · Page ${source.page_number}` : source.section_title ? ` · ${source.section_title}` : ""}</p><p className="mt-1 text-xs leading-5 text-slate-600">{source.snippet}</p></article>)}</div></div>}</div>}{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={ask}><label className="sr-only" htmlFor="knowledge-question">Ask a question</label><input id="knowledge-question" maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-teal-500" placeholder="e.g. What is the cancellation policy?" /><button className="button-primary disabled:opacity-60" disabled={loading}>{loading ? "Searching…" : "Ask"}</button></form></div></section>;
}
