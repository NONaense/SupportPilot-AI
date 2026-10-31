"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export function Brand({
  dark = false,
  href,
}: {
  dark?: boolean;
  href?: string;
}) {
  const [targetHref, setTargetHref] = useState(href || "/");

  useEffect(() => {
    if (href) {
      setTargetHref(href);
      return;
    }
    try {
      const supabase = getSupabaseClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session) {
          setTargetHref("/dashboard");
        }
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setTargetHref(session ? "/dashboard" : "/");
      });
      return () => subscription.unsubscribe();
    } catch {
      // Supabase unconfigured or offline
    }
  }, [href]);

  return (
    <Link
      href={targetHref}
      className={`inline-flex items-center gap-2 font-extrabold tracking-tight transition hover:opacity-90 ${
        dark ? "text-white" : "text-ink dark:text-white"
      }`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500 text-lg text-white shadow-md shadow-teal-500/30">
        ✦
      </span>
      <span>SupportDock</span>
    </Link>
  );
}
