import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const documents = [
  { name: "Membership FAQ.md", status: "Ready", chunks: 12, date: "Today" },
  { name: "Class cancellation policy.pdf", status: "Ready", chunks: 8, date: "Yesterday" },
  { name: "Welcome guide.txt", status: "Processing", chunks: "—", date: "Today" },
];

const conversations = [
  { initials: "SM", name: "Sam Morgan", question: "Can I freeze my membership?", time: "2m ago" },
  { initials: "JN", name: "Jamie Nelson", question: "Do you have a beginner yoga class?", time: "18m ago" },
  { initials: "AR", name: "Alex Rivera", question: "Where can I park?", time: "1h ago" },
];

export function DemoDashboard() {
  return (
    <main className="min-h-screen bg-mist transition-colors">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="shell flex h-16 items-center justify-between">
          <Brand />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/register" className="button-primary !py-2">
              Create a real workspace
            </Link>
          </div>
        </div>
      </header>
      <div className="shell py-8">
        <div className="mb-6">
          <p className="eyebrow">Demo workspace · Fictional, non-persistent data</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Acme Fitness preview</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            This preview never reads or writes a business workspace.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Conversations this week" value="124" trend="Example metric" />
          <Metric label="Answers with sources" value="96%" trend="Example metric" />
          <Metric label="Needs human follow-up" value="5" trend="Example metric" />
        </div>
        <div className="mt-7 grid gap-7 lg:grid-cols-[1.45fr_.85fr]">
          <section className="card p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-extrabold">Knowledge base</h2>
              <p className="mt-1 text-sm text-slate-500">
                Fictional document status—uploads are not active.
              </p>
            </div>
            <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
              {documents.map((doc) => (
                <div className="flex items-center gap-3 py-4" key={doc.name}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
                    ▤
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{doc.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {doc.chunks} chunks · {doc.date}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      doc.status === "Ready"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                    }`}
                  >
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-extrabold">Recent conversations</h2>
            <p className="mt-1 text-sm text-slate-500">Fictional preview</p>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {conversations.map((item) => (
                <div className="flex gap-3 py-4" key={item.name}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {item.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-bold">{item.name}</p>
                      <p className="whitespace-nowrap text-xs text-slate-400">{item.time}</p>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                      {item.question}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <article className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-2 text-xs font-semibold text-teal-600 dark:text-teal-400">{trend}</p>
    </article>
  );
}
