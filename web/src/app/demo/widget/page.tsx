"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";

const DEFAULT_SLUG = "lahiri-transports-b3c5e248";

function WidgetDemoView() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || DEFAULT_SLUG;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-teal-500 selection:text-white">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-2.5 text-center text-xs text-slate-400">
        <span className="font-semibold text-teal-400">Embeddable Widget Demonstration:</span>{" "}
        This external business website embeds the SupportDock AI chat widget for workspace{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-teal-300">{slug}</code>.
        <Link href={`/chat/${slug}`} className="ml-3 text-teal-400 underline hover:text-teal-300">
          Open Fullscreen Chat &rarr;
        </Link>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-xl font-black text-white shadow-lg shadow-teal-500/20">
              L
            </span>
            <div>
              <span className="text-lg font-black tracking-tight text-white">Lahiri Transports</span>
              <p className="text-[11px] font-medium uppercase tracking-wider text-teal-400">Express Logistics & Freight</p>
            </div>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
            <a href="#services" className="transition hover:text-white">Services</a>
            <a href="#fleet" className="transition hover:text-white">Fleet & Network</a>
            <a href="#about" className="transition hover:text-white">About Us</a>
            <a href="#contact" className="transition hover:text-white">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              SupportDock Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800 py-20 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.15),rgba(255,255,255,0))]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              Pan-India Express Logistics Network
            </div>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Reliable Freight & Cargo Across Every Kilometer.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              Full truckload, express parcel delivery, temperature-controlled cold chain, and bonded container transit. 
              Serving enterprise supply chains with 99.4% on-time SLA adherence.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#services"
                className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:bg-teal-400"
              >
                Explore Services
              </a>
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-3 text-xs text-slate-300">
                💬 Need quick answers? <span className="font-semibold text-teal-300">Use our AI assistant &rarr;</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <section className="border-b border-slate-800 bg-slate-950/40 py-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 md:grid-cols-4">
          <div className="border-l-2 border-teal-500 pl-4">
            <div className="text-3xl font-black text-white">99.4%</div>
            <p className="mt-1 text-xs text-slate-400">On-Time SLA Delivery</p>
          </div>
          <div className="border-l-2 border-emerald-500 pl-4">
            <div className="text-3xl font-black text-white">500+</div>
            <p className="mt-1 text-xs text-slate-400">GPS-Tracked Fleet</p>
          </div>
          <div className="border-l-2 border-cyan-500 pl-4">
            <div className="text-3xl font-black text-white">24/7</div>
            <p className="mt-1 text-xs text-slate-400">Real-Time Dispatch Control</p>
          </div>
          <div className="border-l-2 border-teal-400 pl-4">
            <div className="text-3xl font-black text-white">48 hrs</div>
            <p className="mt-1 text-xs text-slate-400">Interstate Express Corridor</p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section id="services" className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-400">Specialized Services</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Engineered for Enterprise Supply Chains
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 transition hover:border-slate-700">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-xl text-teal-400">
                🚛
              </div>
              <h3 className="mt-4 text-base font-bold text-white">Full Truckload (FTL)</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Dedicated container and open-bed freight for industrial consignments, automotive parts, and bulk FMCG distribution.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 transition hover:border-slate-700">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-xl text-teal-400">
                📦
              </div>
              <h3 className="mt-4 text-base font-bold text-white">Express Part-Load (LTL)</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Scheduled consolidation corridors across metro hubs with automated barcode scanning and doorstep delivery tracking.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 transition hover:border-slate-700">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-xl text-teal-400">
                ❄️
              </div>
              <h3 className="mt-4 text-base font-bold text-white">Cold Chain & Pharma Transit</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Active temperature-monitored reefer trucks (-20°C to +25°C) compliant with GDP pharma storage standards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Chat Widget Embedded */}
      <ChatWidget slug={slug} />
    </div>
  );
}

export default function WidgetDemoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 p-8 text-slate-400">Loading showcase...</div>}>
      <WidgetDemoView />
    </Suspense>
  );
}
