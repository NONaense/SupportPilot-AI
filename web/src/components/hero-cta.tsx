"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export function HeroCta() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    try {
      const supabase = getSupabaseClient();
      supabase.auth.getSession().then(({ data }) => {
        setIsLoggedIn(Boolean(data?.session));
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsLoggedIn(Boolean(session));
      });
      return () => subscription.unsubscribe();
    } catch {
      // Supabase unconfigured or offline
    }
  }, []);

  return (
    <div className="mt-9 flex flex-col gap-3 sm:flex-row">
      {isLoggedIn ? (
        <Link className="button-primary" href="/dashboard">
          Go to your dashboard <span className="ml-2">→</span>
        </Link>
      ) : (
        <Link className="button-primary" href="/register">
          Build your support dock <span className="ml-2">→</span>
        </Link>
      )}
      <Link className="button-secondary" href="/demo">
        View demo workspace
      </Link>
    </div>
  );
}
