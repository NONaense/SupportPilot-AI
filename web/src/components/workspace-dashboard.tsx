"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, getSupabaseClient } from "@/lib/supabase";
import { DocumentManager } from "@/components/document-manager";
import { KnowledgeChat } from "@/components/knowledge-chat";

type Workspace = { id: string; name: string; slug: string; role: string };

export function WorkspaceDashboard() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      setEmail(session.user.email ?? "");
      const response = await fetch(`${apiUrl}/api/v1/workspaces`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not load your workspaces.");
      setWorkspaces(await response.json());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load your workspaces."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []); // Session is rechecked by the API on every request.

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError(undefined);
    const form = event.currentTarget;
    try {
      const name = String(new FormData(form).get("name") ?? "");
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const response = await fetch(`${apiUrl}/api/v1/workspaces`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not create your workspace.");
      const createdWorkspace: Workspace = await response.json();
      setWorkspaces((current) => [...current, createdWorkspace]);
      form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create your workspace."); }
    finally { setCreating(false); }
  }

  async function signOut() { const supabase = getSupabaseClient(); await supabase.auth.signOut(); router.replace("/"); }

  if (loading) return <p className="p-8 text-slate-600">Checking your secure session…</p>;
  return <div className="shell py-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Private workspace</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight">Your SupportDock</h1><p className="mt-2 text-slate-600">Signed in as {email}. Workspace access is checked by the API and database policies.</p></div><button className="button-secondary" onClick={() => void signOut()}>Sign out</button></div>{error && <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}<section className="mt-7 card p-6"><h2 className="text-lg font-extrabold">Your workspaces</h2>{workspaces.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{workspaces.map((workspace) => <article className="rounded-xl border border-slate-200 p-4" key={workspace.id}><p className="font-bold">{workspace.name}</p><p className="mt-1 text-sm text-slate-500">{workspace.slug} · {workspace.role}</p></article>)}</div> : <p className="mt-3 text-sm leading-6 text-slate-600">You do not belong to a workspace yet. Create one below; you will become its owner.</p>}<form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={createWorkspace}><input required name="name" maxLength={120} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-teal-500" placeholder="Business name" /><button className="button-primary disabled:opacity-60" disabled={creating}>{creating ? "Creating…" : "Create workspace"}</button></form></section>{workspaces[0] && <><DocumentManager workspace={workspaces[0]} /><KnowledgeChat workspace={workspaces[0]} /></>}<section className="mt-7 rounded-2xl bg-ink p-6 text-white"><p className="text-sm font-bold text-teal-300">GROUNDING SAFEGUARD</p><h2 className="mt-2 text-2xl font-extrabold">No evidence, no business answer.</h2><p className="mt-3 leading-7 text-slate-300">SupportDock returns a clear human-handoff response when the indexed knowledge base does not support an answer.</p></section></div>;
}
