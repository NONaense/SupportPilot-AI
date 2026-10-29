"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="shell flex h-16 items-center justify-between">
        <Brand />
        <nav
          className="hidden items-center gap-7 text-sm font-semibold text-slate-600 dark:text-slate-300 md:flex"
          aria-label="Main navigation"
        >
          <a href="#how-it-works" className="transition hover:text-teal-600 dark:hover:text-teal-400">
            How it works
          </a>
          <a href="#features" className="transition hover:text-teal-600 dark:hover:text-teal-400">
            Features
          </a>
          <a href="#trust" className="transition hover:text-teal-600 dark:hover:text-teal-400">
            Trust
          </a>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link
            className="text-sm font-bold text-slate-700 transition hover:text-teal-600 dark:text-slate-200 dark:hover:text-teal-400"
            href="/login"
          >
            Sign in
          </Link>
          <Link className="button-primary !py-2.5" href="/register">
            Start free
          </Link>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg p-2 text-slate-700 dark:text-slate-200"
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <nav className="flex flex-col gap-4 text-sm font-semibold">
            <a href="#how-it-works" onClick={() => setOpen(false)}>
              How it works
            </a>
            <a href="#features" onClick={() => setOpen(false)}>
              Features
            </a>
            <Link href="/login">Sign in</Link>
            <Link className="button-primary" href="/register">
              Start free
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
