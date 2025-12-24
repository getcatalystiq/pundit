import { useEffect, useState } from 'react';
import { users, User, CreateUserRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import './Databases.css';

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
    } catch (err) {
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
    return <div>Loading...</div>;
  }

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-description">
          Manage users in your organization
        </p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add User
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add User</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>

              <div className="form-group">
                <label className="label">Name (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="label">Role</label>
                <select
                  className="input"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>

              <div className="form-group">
                <label className="label">Scopes</label>
                <div className="scopes-list">
                  {['read', 'write', 'admin'].map((scope) => (
                    <label key={scope} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.scopes?.includes(scope)}
                        onChange={(e) => handleScopeChange(scope, e.target.checked)}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userList.length === 0 ? (
        <div className="empty-state card">
          <p>No users yet.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add your first user
          </button>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Last Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {userList.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.email}
                    {user.id === currentUser?.sub && (
                      <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>You</span>
                    )}
                  </td>
                  <td>{user.name || '-'}</td>
                  <td>
                    <span className="badge badge-secondary">{user.role}</span>
                  </td>
                  <td>
                    <div className="scopes-tags">
                      {user.scopes?.map((scope) => (
                        <span key={scope} className="scope-tag">{scope}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className={`badge ${user.is_active ? 'badge-success' : 'badge-warning'}`}
                      onClick={() => handleToggleActive(user)}
                      style={{ cursor: 'pointer', border: 'none' }}
                      title="Click to toggle"
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td>
                    {user.id !== currentUser?.sub && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(user.id, user.email)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .scopes-list {
          display: flex;
          gap: 1rem;
        }
        .scopes-tags {
          display: flex;
          gap: 0.25rem;
        }
        .scope-tag {
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          background: var(--gray-100);
          border-radius: 0.25rem;
          color: var(--gray-600);
        }
        .badge-secondary {
          background: var(--gray-100);
          color: var(--gray-700);
        }
      `}</style>
    </div>
  );
}
