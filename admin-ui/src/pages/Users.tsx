import { useEffect, useState } from 'react';
import { users, User, CreateUserRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function Users() {
  const { user: currentUser } = useAuth();
  const [userList, setUserList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateUserRequest>({
    email: '',
    password: '',
    name: '',
    role: 'member',
    scopes: ['read', 'write'],
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await users.list();
      setUserList(response.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await users.create(formData);
      setShowCreate(false);
      setFormData({ email: '', password: '', name: '', role: 'member', scopes: ['read', 'write'] });
      fetchUsers();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await users.update(user.id, { is_active: !user.is_active });
      fetchUsers();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to update user');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (id === currentUser?.sub) {
      setError("You cannot delete yourself");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${email}"?`)) {
      return;
    }

    try {
      await users.delete(id);
      fetchUsers();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to delete user');
    }
  };

  const handleScopeChange = (scope: string, checked: boolean) => {
    const currentScopes = formData.scopes || [];
    if (checked) {
      setFormData({ ...formData, scopes: [...currentScopes, scope] });
    } else {
      setFormData({ ...formData, scopes: currentScopes.filter((s) => s !== scope) });
    }
  };

  if (loading) {
    return <LoadingState message="Loading users..." />;
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">
          Manage users in your organization
        </p>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => setShowCreate(true)}>
            Add User
          </Button>
        </div>
      </header>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="flex gap-4">
                {['read', 'write', 'admin'].map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={formData.scopes?.includes(scope)}
                      onChange={(e) => handleScopeChange(scope, e.target.checked)}
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {userList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No users yet.</p>
            <Button onClick={() => setShowCreate(true)}>
              Add your first user
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userList.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <span className="font-medium">{user.email}</span>
                    {user.id === currentUser?.sub && (
                      <Badge variant="success" className="ml-2">You</Badge>
                    )}
                  </TableCell>
                  <TableCell>{user.name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.scopes?.map((scope) => (
                        <span
                          key={scope}
                          className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleActive(user)}
                      title="Click to toggle"
                    >
                      <Badge variant={user.is_active ? 'success' : 'warning'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    {user.id !== currentUser?.sub && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(user.id, user.email)}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
