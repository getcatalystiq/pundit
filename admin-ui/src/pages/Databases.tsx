import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, Database, CreateDatabaseRequest } from '../api/client';
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

export function Databases() {
  const [databaseList, setDatabaseList] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateDatabaseRequest>({
    name: '',
    db_type: 'postgresql',
    is_default: false,
    connection_config: {
      host: '',
      port: 5432,
      database: '',
      username: '',
      password: '',
    },
  });

  useEffect(() => {
    fetchDatabases();
  }, []);

  const fetchDatabases = async () => {
    try {
      const response = await databases.list();
      setDatabaseList(response.databases);
    } catch {
      setError('Failed to load databases');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await databases.create(formData);
      setShowCreate(false);
      setFormData({
        name: '',
        db_type: 'postgresql',
        is_default: false,
        connection_config: { host: '', port: 5432, database: '', username: '', password: '' },
      });
      fetchDatabases();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to create database');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all training data.`)) {
      return;
    }

    try {
      await databases.delete(id);
      fetchDatabases();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to delete database');
    }
  };

  if (loading) {
    return <LoadingState message="Loading databases..." />;
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground">Databases</h1>
        <p className="text-muted-foreground mt-1">
          Manage database connections and training data
        </p>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => setShowCreate(true)}>
            Add Database
          </Button>
        </div>
      </header>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Database</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db_type">Database Type</Label>
              <select
                id="db_type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formData.db_type}
                onChange={(e) => {
                  const dbType = e.target.value;
                  const defaultPort = dbType === 'postgresql' ? 5432 : dbType === 'mysql' ? 3306 : 5432;
                  setFormData({
                    ...formData,
                    db_type: dbType,
                    connection_config: { ...formData.connection_config, port: defaultPort },
                  });
                }}
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="snowflake">Snowflake</option>
                <option value="bigquery">BigQuery</option>
              </select>
            </div>

            <h3 className="text-sm font-medium pt-2">Connection Details</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  placeholder="localhost or db.example.com"
                  value={(formData.connection_config as Record<string, unknown>)?.host as string || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    connection_config: { ...formData.connection_config, host: e.target.value },
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={(formData.connection_config as Record<string, unknown>)?.port as number || 5432}
                  onChange={(e) => setFormData({
                    ...formData,
                    connection_config: { ...formData.connection_config, port: parseInt(e.target.value) || 5432 },
                  })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="database">Database Name</Label>
              <Input
                id="database"
                placeholder="mydb"
                value={(formData.connection_config as Record<string, unknown>)?.database as string || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  connection_config: { ...formData.connection_config, database: e.target.value },
                })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="postgres"
                  value={(formData.connection_config as Record<string, unknown>)?.username as string || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    connection_config: { ...formData.connection_config, username: e.target.value },
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={(formData.connection_config as Record<string, unknown>)?.password as string || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    connection_config: { ...formData.connection_config, password: e.target.value },
                  })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_default"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              />
              <Label htmlFor="is_default" className="font-normal">Set as default database</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {databaseList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No databases configured yet.</p>
            <Button onClick={() => setShowCreate(true)}>
              Add your first database
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Training Data</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {databaseList.map((db) => (
                <TableRow key={db.id}>
                  <TableCell>
                    <Link to={`/databases/${db.id}`} className="text-primary hover:underline font-medium">
                      {db.name}
                    </Link>
                    {db.is_default && <Badge variant="success" className="ml-2">Default</Badge>}
                  </TableCell>
                  <TableCell>{db.db_type}</TableCell>
                  <TableCell>
                    <Badge variant={db.enabled ? 'success' : 'warning'}>
                      {db.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {db.training_data ? (
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span title="DDL">{db.training_data.ddl_count} DDL</span>
                        <span title="Documentation">{db.training_data.documentation_count} Docs</span>
                        <span title="Examples">{db.training_data.examples_count} Examples</span>
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{new Date(db.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(db.id, db.name)}
                    >
                      Delete
                    </Button>
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
