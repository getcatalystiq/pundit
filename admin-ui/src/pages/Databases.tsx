import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, Database, CreateDatabaseRequest } from '../api/client';
import './Databases.css';

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
  });

  useEffect(() => {
    fetchDatabases();
  }, []);

  const fetchDatabases = async () => {
    try {
      const response = await databases.list();
      setDatabaseList(response.databases);
    } catch (err) {
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
      setFormData({ name: '', db_type: 'postgresql', is_default: false });
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
    return <div>Loading...</div>;
  }

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Databases</h1>
        <p className="page-description">
          Manage database connections and training data
        </p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add Database
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Database</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="label">Database Type</label>
                <select
                  className="input"
                  value={formData.db_type}
                  onChange={(e) => setFormData({ ...formData, db_type: e.target.value })}
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="snowflake">Snowflake</option>
                  <option value="bigquery">BigQuery</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  />
                  Set as default database
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {databaseList.length === 0 ? (
        <div className="empty-state card">
          <p>No databases configured yet.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add your first database
          </button>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Training Data</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {databaseList.map((db) => (
                <tr key={db.id}>
                  <td>
                    <Link to={`/databases/${db.id}`} className="db-name">
                      {db.name}
                      {db.is_default && <span className="badge badge-success">Default</span>}
                    </Link>
                  </td>
                  <td>{db.db_type}</td>
                  <td>
                    <span className={`badge ${db.enabled ? 'badge-success' : 'badge-warning'}`}>
                      {db.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="training-data">
                    {db.training_data ? (
                      <>
                        <span title="DDL">{db.training_data.ddl_count} DDL</span>
                        <span title="Documentation">{db.training_data.documentation_count} Docs</span>
                        <span title="Examples">{db.training_data.examples_count} Examples</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{new Date(db.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(db.id, db.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
