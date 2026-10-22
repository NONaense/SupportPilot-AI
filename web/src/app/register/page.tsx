import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() { return <main className="min-h-screen bg-mist"><div className="shell py-6"><Brand /></div><section className="mx-auto mt-8 w-full max-w-md px-5 pb-12"><div className="card p-7 sm:p-9"><p className="eyebrow">Start your workspace</p><h1 className="mt-5 text-3xl font-extrabold tracking-tight">Create your SupportDock account</h1><p className="mt-3 text-sm leading-6 text-slate-600">After verification, create a private workspace for your business. We never create demo records in your account.</p><AuthForm mode="register" /></div></section></main>; }
