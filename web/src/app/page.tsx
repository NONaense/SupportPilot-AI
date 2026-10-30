import Link from "next/link";
import { Brand } from "@/components/brand";
import { SiteHeader } from "@/components/site-header";

const features = [
  [
    "Grounded answers",
    "Every answer is anchored to your approved knowledge base, so customers receive verified information.",
  ],
  [
    "Private & tenant-isolated",
    "Customer queries and private business files never leak across workspaces or third-party training data.",
  ],
  [
    "Made for the busy team",
    "Review customer threads, spot unanswered topics, and improve your knowledge coverage over time.",
  ],
];

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-mist transition-colors dark:bg-slate-950">
      <SiteHeader />
      <section className="relative">
        <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-gradient-to-br from-teal-50 via-white to-blue-50 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-950" />
        <div className="shell relative z-10 grid gap-12 pb-20 pt-20 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:py-28">
          <div>
            <p className="eyebrow">Customer support, made dependable</p>
            <h1 className="mt-6 max-w-3xl text-5xl font-extrabold leading-[1.04] tracking-tight text-ink dark:text-white sm:text-6xl">
              Answers your customers can <span className="text-teal-600 dark:text-teal-400">trust.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              SupportDock turns your help docs into a clear, friendly support experience with grounded answers directly from your approved knowledge base.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/register">
                Build your support dock <span className="ml-2">→</span>
              </Link>
              <Link className="button-secondary" href="/demo">
                View demo workspace
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
              No credit card required · Your content stays yours
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-8 -z-10 rounded-full bg-teal-200/40 blur-3xl dark:bg-teal-900/30" />
            <div className="card overflow-hidden shadow-glow dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-100 font-bold text-orange-600 dark:bg-orange-950/70 dark:text-orange-400">
                  A
                </span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Acme Fitness</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Usually replies instantly</p>
                </div>
                <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="space-y-4 bg-slate-50 p-5 text-sm dark:bg-slate-950/60">
                <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white p-3.5 text-slate-700 shadow-sm dark:border dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  Can I pause my membership while I travel?
                </div>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-teal-600 p-3.5 text-white">
                  Yes—Acme Fitness allows one membership pause of up to 30 days per calendar year.
                </div>
              </div>
              <div className="flex gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  Ask a question…
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 text-white">↑</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="shell grid gap-6 py-7 text-center sm:grid-cols-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">✓ Evidence-first answers</p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">✓ Your knowledge, your control</p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">✓ Built for small teams</p>
        </div>
      </section>

      <section id="how-it-works" className="shell py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">Simple by design</p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            From docs to helpful conversations.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            ["01", "Add your knowledge", "Upload the policies, FAQs, and guides your team already relies on."],
            ["02", "Share your support dock", "Add a polished chat experience to the places your customers need help."],
            ["03", "Learn from every question", "See conversations and identify the topics your customers ask about most."],
          ].map(([number, title, body]) => (
            <article className="card p-6 dark:border-slate-800 dark:bg-slate-900" key={number}>
              <span className="text-sm font-extrabold text-teal-600 dark:text-teal-400">{number}</span>
              <h3 className="mt-8 text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="bg-ink py-20 text-white border-t border-slate-800">
        <div className="shell grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="eyebrow !border-teal-800 !bg-teal-900/40 !text-teal-200">Calm, clear support</p>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
              The answer is only as good as its evidence.
            </h2>
            <p className="mt-5 leading-7 text-slate-300">
              SupportDock is designed around a simple principle: when the information is not in your knowledge base, the assistant should say so.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {features.map(([title, body]) => (
              <article className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5" key={title}>
                <span className="text-lg text-teal-300">✦</span>
                <h3 className="mt-7 font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-ink pb-8">
        <div className="shell flex flex-col gap-4 border-t border-slate-700 pt-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <Brand dark />
          <p>© 2026 SupportDock. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
