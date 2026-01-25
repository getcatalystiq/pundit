import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { databases, users, Database } from '../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingCard } from '@/components/ui/loading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    databaseCount: 0,
    userCount: 0,
    loading: true,
  });
  const [recentDatabases, setRecentDatabases] = useState<Database[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [dbResponse, userResponse] = await Promise.all([
          databases.list(),
          users.list(),
        ]);

        setStats({
          databaseCount: dbResponse.databases.length,
          userCount: userResponse.users.length,
          loading: false,
        });

        setRecentDatabases(
          dbResponse.databases
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3)
        );
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user?.name || user?.email}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {stats.loading ? (
          <>
            <LoadingCard />
            <LoadingCard />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="text-4xl font-bold font-serif text-foreground">
                  {stats.databaseCount}
                </div>
                <div className="text-sm text-muted-foreground mt-2">Databases</div>
                <Link to="/databases" className="inline-block mt-4 text-sm text-primary hover:underline">
                  Manage databases
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-4xl font-bold font-serif text-foreground">
                  {stats.userCount}
                </div>
                <div className="text-sm text-muted-foreground mt-2">Users</div>
                <Link to="/users" className="inline-block mt-4 text-sm text-primary hover:underline">
                  Manage users
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {recentDatabases.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold font-serif text-foreground mb-4">Recent Databases</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDatabases.map((db) => (
                  <TableRow key={db.id}>
                    <TableCell>
                      <Link to={`/databases/${db.id}`} className="text-primary hover:underline">
                        {db.name}
                      </Link>
                    </TableCell>
                    <TableCell>{db.db_type}</TableCell>
                    <TableCell>
                      <Badge variant={db.enabled ? 'success' : 'warning'}>
                        {db.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(db.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold font-serif text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <Link
            to="/databases"
            className="flex flex-col items-center justify-center p-6 bg-card border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors no-underline"
          >
            <Plus className="h-8 w-8 mb-2" />
            <span className="text-sm font-medium">Add Database</span>
          </Link>
          <Link
            to="/users"
            className="flex flex-col items-center justify-center p-6 bg-card border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors no-underline"
          >
            <Plus className="h-8 w-8 mb-2" />
            <span className="text-sm font-medium">Invite User</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
