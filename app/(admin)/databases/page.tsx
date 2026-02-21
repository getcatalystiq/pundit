"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Database {
  id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_mode: string;
  is_default: boolean;
  enabled: boolean;
  created_at: string;
}

export default function DatabasesPage() {
  const { getToken } = useAuth();
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabases = async () => {
    try {
      const response = await fetchWithAuth("/api/admin/databases");
      const data = await response.json();
      setDatabases(data.databases);
    } catch {
      setError("Failed to load databases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, [getToken]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      await fetchWithAuth("/api/admin/databases", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          host: form.get("host"),
          port: Number(form.get("port")) || 5432,
          database_name: form.get("database_name"),
          username: form.get("username"),
          password: form.get("password"),
          ssl_mode: form.get("ssl_mode") || "require",
          is_default: form.get("is_default") === "on",
        }),
      });
      setShowCreate(false);
      await fetchDatabases();
    } catch (err: unknown) {
      setError(
        (err as { error?: string })?.error || "Failed to create database"
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Databases</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Add Database"}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add Database Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <input name="name" placeholder="Display name" required className="col-span-2 rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="host" placeholder="Host" required className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="port" placeholder="Port" defaultValue="5432" type="number" className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="database_name" placeholder="Database name" required className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="username" placeholder="Username" required className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="password" placeholder="Password" required type="password" className="rounded-md border px-3 py-2 text-sm bg-background" />
              <select name="ssl_mode" className="rounded-md border px-3 py-2 text-sm bg-background">
                <option value="require">SSL: Require</option>
                <option value="prefer">SSL: Prefer</option>
                <option value="disable">SSL: Disable</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_default" type="checkbox" /> Set as default
              </label>
              <Button type="submit" disabled={creating} className="col-span-2">
                {creating ? "Testing & Saving..." : "Test & Save"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-12 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : databases.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No databases connected yet. Click &quot;Add Database&quot; to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {databases.map((db) => (
            <Link key={db.id} href={`/databases/${db.id}`}>
              <Card className="hover:border-indigo-500/50 transition-colors cursor-pointer">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {db.name}
                      {db.is_default && (
                        <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-2 py-0.5 rounded">
                          default
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {db.host}:{db.port}/{db.database_name}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${db.enabled ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                  >
                    {db.enabled ? "Enabled" : "Disabled"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
