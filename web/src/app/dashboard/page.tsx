import { Brand } from "@/components/brand";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default function DashboardPage() { return <main className="min-h-screen bg-mist"><header className="border-b border-slate-200 bg-white"><div className="shell flex h-16 items-center justify-between"><Brand /><span className="text-sm font-semibold text-slate-500">Secure workspace</span></div></header><WorkspaceDashboard /></main>; }
