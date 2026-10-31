"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isRegistration = mode === "register";

  useEffect(() => {
    try {
      const supabase = getSupabaseClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session) {
          router.replace("/dashboard");
        }
      });
    } catch {
      // Supabase unconfigured
    }
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined); setMessage(undefined); setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      const supabase = getSupabaseClient();
      if (isRegistration) {
        const displayName = String(form.get("name") ?? "");
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (authError) throw authError;
        if (!data.session) setMessage("Check your email to confirm your account, then sign in.");
        else router.replace("/dashboard");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace("/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete that request.");
    } finally { setBusy(false); }
  }

  return <form className="mt-7 space-y-4" onSubmit={submit}>
    {isRegistration && <label className="block text-sm font-bold">Your name<input required name="name" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-teal-500" placeholder="Jordan Lee" /></label>}
    <label className="block text-sm font-bold">Email<input required name="email" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-teal-500" placeholder="you@business.com" type="email" autoComplete="email" /></label>
    <label className="block text-sm font-bold">Password<input required minLength={6} name="password" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-teal-500" placeholder="At least 6 characters" type="password" autoComplete={isRegistration ? "new-password" : "current-password"} /></label>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    <button disabled={busy} className="button-primary mt-2 w-full disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Please wait…" : isRegistration ? "Create account" : "Sign in"}</button>
    <p className="text-center text-sm text-slate-600">{isRegistration ? "Already have an account?" : "New to SupportDock?"} <Link className="font-bold text-teal-600" href={isRegistration ? "/login" : "/register"}>{isRegistration ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}
