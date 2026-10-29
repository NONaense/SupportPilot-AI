import Link from "next/link";

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-extrabold tracking-tight transition ${
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
