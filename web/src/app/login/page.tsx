import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() { return <main className="min-h-screen bg-mist"><div className="shell py-6"><Brand /></div><section className="mx-auto mt-8 w-full max-w-md px-5 pb-12"><div className="card p-7 sm:p-9"><p className="eyebrow">Welcome back</p><h1 className="mt-5 text-3xl font-extrabold tracking-tight">Sign in to SupportDock</h1><p className="mt-3 text-sm leading-6 text-slate-600">Use your SupportDock account to access only the workspaces you belong to.</p><AuthForm mode="login" /></div></section></main>; }
