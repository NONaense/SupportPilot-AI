import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-mist transition-colors">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="shell flex h-16 items-center justify-between">
          <Brand href="/dashboard" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Secure workspace
            </span>
          </div>
        </div>
      </header>
      <WorkspaceDashboard />
    </main>
  );
}
