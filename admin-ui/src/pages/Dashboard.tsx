import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { databases, users, Database, User } from '../api/client';
import './Dashboard.css';

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

        // Get 3 most recent databases
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
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Welcome back, {user?.name || user?.email}
        </p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {stats.loading ? '...' : stats.databaseCount}
          </div>
          <div className="stat-label">Databases</div>
          <Link to="/databases" className="stat-link">
            Manage databases
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-value">
            {stats.loading ? '...' : stats.userCount}
          </div>
          <div className="stat-label">Users</div>
          <Link to="/users" className="stat-link">
            Manage users
          </Link>
        </div>
      </div>

      {recentDatabases.length > 0 && (
        <section className="recent-section">
          <h2 className="section-title">Recent Databases</h2>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentDatabases.map((db) => (
                  <tr key={db.id}>
                    <td>
                      <Link to={`/databases/${db.id}`}>{db.name}</Link>
                    </td>
                    <td>{db.db_type}</td>
                    <td>
                      <span className={`badge ${db.enabled ? 'badge-success' : 'badge-warning'}`}>
                        {db.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>{new Date(db.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="quick-actions">
        <h2 className="section-title">Quick Actions</h2>
        <div className="actions-grid">
          <Link to="/databases" className="action-card">
            <div className="action-icon">+</div>
            <div className="action-label">Add Database</div>
          </Link>
          <Link to="/users" className="action-card">
            <div className="action-icon">+</div>
            <div className="action-label">Invite User</div>
          </Link>
        </div>
      </section>
    </div>
  );
}
