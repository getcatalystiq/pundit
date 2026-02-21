import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Pundit</h1>
      <p className="text-muted-foreground text-lg text-center max-w-md mb-8">
        AI-powered database querying via MCP. Connect your databases, train with
        context, and let AI agents query them using natural language.
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
      >
        Admin Dashboard
      </Link>
    </main>
  );
}
