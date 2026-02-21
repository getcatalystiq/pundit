"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  scopes: string[];
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const response = await fetchWithAuth("/api/admin/users");
      const data = await response.json();
      setUsers(data.users);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      await fetchWithAuth("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          name: form.get("name") || undefined,
          role: form.get("role"),
          scopes: ["read", "write"],
        }),
      });
      setShowCreate(false);
      await fetchUsers();
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      await fetchWithAuth(`/api/admin/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !isActive }),
      });
      await fetchUsers();
    } catch {
      alert("Failed to update user");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      await fetchWithAuth(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      await fetchUsers();
    } catch (err: unknown) {
      alert((err as { error?: string })?.error || "Failed to delete user");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Users</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Add User"}
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
            <CardTitle>Create User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <input name="email" placeholder="Email" required type="email" className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="password" placeholder="Password (min 12 chars)" required type="password" minLength={12} className="rounded-md border px-3 py-2 text-sm bg-background" />
              <input name="name" placeholder="Name (optional)" className="rounded-md border px-3 py-2 text-sm bg-background" />
              <select name="role" className="rounded-md border px-3 py-2 text-sm bg-background">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <Button type="submit" disabled={creating} className="col-span-2">
                {creating ? "Creating..." : "Create User"}
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
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">
                    {u.name || u.email}
                    {u.id === currentUser?.sub && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {u.email} &middot; {u.role} &middot; {u.scopes.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(u.id, u.is_active)}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </Button>
                  {u.id !== currentUser?.sub && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(u.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
