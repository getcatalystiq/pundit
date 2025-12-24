import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  databases, ddl, docs, examples, ai,
  Database, DDLEntry, DocEntry, ExampleEntry,
  GeneratedExample, SchemaAnalysis
} from '../api/client';
import './DatabaseDetail.css';

type TabType = 'ddl' | 'docs' | 'examples' | 'ai';

export function DatabaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [database, setDatabase] = useState<Database | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('ddl');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Training data
  const [ddlList, setDdlList] = useState<DDLEntry[]>([]);
  const [docsList, setDocsList] = useState<DocEntry[]>([]);
  const [examplesList, setExamplesList] = useState<ExampleEntry[]>([]);

  // Add forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newDdl, setNewDdl] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [newExample, setNewExample] = useState({ question: '', sql: '' });

  // AI Generation state
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const [aiPreviewType, setAiPreviewType] = useState<'ddl' | 'docs' | 'examples'>('ddl');
  const [aiPreviewContent, setAiPreviewContent] = useState<string>('');
  const [aiPreviewExamples, setAiPreviewExamples] = useState<GeneratedExample[]>([]);
  const [schemaAnalysis, setSchemaAnalysis] = useState<SchemaAnalysis | null>(null);
  const [docSuggestions, setDocSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      fetchDatabase();
      fetchTrainingData();
    }
  }, [id]);

  const fetchDatabase = async () => {
    try {
      const data = await databases.get(id!);
      setDatabase(data);
    } catch {
      setError('Failed to load database');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrainingData = async () => {
    try {
      const [ddlData, docsData, examplesData] = await Promise.all([
        ddl.list(id!),
        docs.list(id!),
        examples.list(id!),
      ]);
      setDdlList(ddlData.ddl);
      setDocsList(docsData.documentation);
      setExamplesList(examplesData.examples);
    } catch (err) {
      console.error('Failed to load training data:', err);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Manual add handlers
  const handleAddDdl = async () => {
    if (!newDdl.trim()) return;
    setAddingItem(true);
    try {
      await ddl.add(id!, newDdl);
      setNewDdl('');
      setShowAddForm(false);
      fetchTrainingData();
      showSuccess('DDL added successfully');
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to add DDL');
    } finally {
      setAddingItem(false);
    }
  };

  const handleAddDoc = async () => {
    if (!newDoc.trim()) return;
    setAddingItem(true);
    try {
      await docs.add(id!, newDoc);
      setNewDoc('');
      setShowAddForm(false);
      fetchTrainingData();
      showSuccess('Documentation added successfully');
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to add documentation');
    } finally {
      setAddingItem(false);
    }
  };

  const handleAddExample = async () => {
    if (!newExample.question.trim() || !newExample.sql.trim()) return;
    setAddingItem(true);
    try {
      await examples.add(id!, newExample.question, newExample.sql);
      setNewExample({ question: '', sql: '' });
      setShowAddForm(false);
      fetchTrainingData();
      showSuccess('Example added successfully');
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to add example');
    } finally {
      setAddingItem(false);
    }
  };

  // Delete handlers
  const handleDeleteDdl = async (itemId: string) => {
    if (!confirm('Delete this DDL entry?')) return;
    try {
      await ddl.delete(id!, itemId);
      fetchTrainingData();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to delete');
    }
  };

  const handleDeleteDoc = async (itemId: string) => {
    if (!confirm('Delete this documentation entry?')) return;
    try {
      await docs.delete(id!, itemId);
      fetchTrainingData();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to delete');
    }
  };

  const handleDeleteExample = async (itemId: string) => {
    if (!confirm('Delete this example?')) return;
    try {
      await examples.delete(id!, itemId);
      fetchTrainingData();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to delete');
    }
  };

  // AI Generation handlers
  const handlePullDDL = async () => {
    setAiLoading(true);
    setError(null);
    try {
      const response = await ai.pullDDL(id!, { schema: 'public' });
      setAiPreviewType('ddl');
      setAiPreviewContent(response.ddl);
      setShowAiPreview(true);
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to pull DDL from database');
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateDocs = async () => {
    if (ddlList.length === 0) {
      setError('Please add DDL first before generating documentation');
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const response = await ai.generateDocs(id!);
      setAiPreviewType('docs');
      setAiPreviewContent(response.documentation);
      setShowAiPreview(true);
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to generate documentation');
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateExamples = async () => {
    if (ddlList.length === 0) {
      setError('Please add DDL first before generating examples');
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const response = await ai.generateExamples(id!, { count: 5 });
      setAiPreviewType('examples');
      setAiPreviewExamples(response.examples);
      setShowAiPreview(true);
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to generate examples');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAnalyzeSchema = async () => {
    if (ddlList.length === 0) {
      setError('Please add DDL first before analyzing');
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const response = await ai.analyze(id!);
      setSchemaAnalysis(response.analysis);
      setDocSuggestions(response.documentation_suggestions);
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to analyze schema');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveAiContent = async () => {
    setAddingItem(true);
    try {
      if (aiPreviewType === 'ddl') {
        await ddl.add(id!, aiPreviewContent);
        showSuccess('DDL saved successfully');
      } else if (aiPreviewType === 'docs') {
        await docs.add(id!, aiPreviewContent);
        showSuccess('Documentation saved successfully');
      } else if (aiPreviewType === 'examples') {
        for (const example of aiPreviewExamples) {
          await examples.add(id!, example.question, example.sql);
        }
        showSuccess(`${aiPreviewExamples.length} examples saved successfully`);
      }
      setShowAiPreview(false);
      fetchTrainingData();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setError(error.error || 'Failed to save');
    } finally {
      setAddingItem(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!database) {
    return <div>Database not found</div>;
  }

  return (
    <div>
      <header className="page-header">
        <div className="breadcrumb">
          <Link to="/databases">Databases</Link> / {database.name}
        </div>
        <h1 className="page-title">{database.name}</h1>
        <p className="page-description">
          {database.db_type} &middot;{' '}
          <span className={database.enabled ? 'text-success' : 'text-warning'}>
            {database.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </p>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'ddl' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ddl'); setShowAddForm(false); }}
        >
          DDL ({ddlList.length})
        </button>
        <button
          className={`tab ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => { setActiveTab('docs'); setShowAddForm(false); }}
        >
          Documentation ({docsList.length})
        </button>
        <button
          className={`tab ${activeTab === 'examples' ? 'active' : ''}`}
          onClick={() => { setActiveTab('examples'); setShowAddForm(false); }}
        >
          Examples ({examplesList.length})
        </button>
        <button
          className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ai'); setShowAddForm(false); }}
        >
          AI Assistant
        </button>
      </div>

      {/* AI Preview Modal */}
      {showAiPreview && (
        <div className="modal-backdrop" onClick={() => setShowAiPreview(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>
              {aiPreviewType === 'ddl' && 'Pulled Schema DDL'}
              {aiPreviewType === 'docs' && 'Generated Documentation'}
              {aiPreviewType === 'examples' && 'Generated Examples'}
            </h2>
            <p className="modal-subtitle">Review the AI-generated content before saving</p>

            <div className="ai-preview-content">
              {(aiPreviewType === 'ddl' || aiPreviewType === 'docs') && (
                <textarea
                  className="input textarea ai-preview-textarea"
                  value={aiPreviewContent}
                  onChange={(e) => setAiPreviewContent(e.target.value)}
                  rows={15}
                />
              )}

              {aiPreviewType === 'examples' && (
                <div className="ai-preview-examples">
                  {aiPreviewExamples.map((example, idx) => (
                    <div key={idx} className="ai-preview-example">
                      <div className="example-question">Q: {example.question}</div>
                      <pre className="example-sql">{example.sql}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAiPreview(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveAiContent} disabled={addingItem}>
                {addingItem ? 'Saving...' : 'Save to Training Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tab-content card">
        {/* DDL Tab */}
        {activeTab === 'ddl' && (
          <>
            <div className="tab-header">
              <h3>Schema Definitions</h3>
              <div className="tab-header-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handlePullDDL}
                  disabled={aiLoading}
                >
                  {aiLoading ? 'Pulling...' : 'Pull from Database'}
                </button>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                  Add DDL
                </button>
              </div>
            </div>

            {showAddForm && (
              <div className="add-form">
                <textarea
                  className="input textarea"
                  placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL,&#10;  created_at TIMESTAMP DEFAULT NOW()&#10;);"
                  value={newDdl}
                  onChange={(e) => setNewDdl(e.target.value)}
                  rows={6}
                />
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddDdl} disabled={addingItem}>
                    {addingItem ? 'Adding...' : 'Add DDL'}
                  </button>
                </div>
              </div>
            )}

            <div className="items-list">
              {ddlList.length === 0 ? (
                <div className="empty-message">
                  <p>No DDL entries yet.</p>
                  <p className="empty-hint">Add schema definitions manually or pull from your connected database.</p>
                </div>
              ) : (
                ddlList.map((item) => (
                  <div key={item.id} className="item">
                    <pre className="item-content">{item.ddl}</pre>
                    <div className="item-meta">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDdl(item.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Documentation Tab */}
        {activeTab === 'docs' && (
          <>
            <div className="tab-header">
              <h3>Documentation</h3>
              <div className="tab-header-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleGenerateDocs}
                  disabled={aiLoading || ddlList.length === 0}
                  title={ddlList.length === 0 ? 'Add DDL first' : ''}
                >
                  {aiLoading ? 'Generating...' : 'Generate with AI'}
                </button>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                  Add Doc
                </button>
              </div>
            </div>

            {showAddForm && (
              <div className="add-form">
                <textarea
                  className="input textarea"
                  placeholder="Document business rules, column meanings, or important context...&#10;&#10;Example: The 'status' column in orders can be: pending, processing, shipped, delivered, cancelled."
                  value={newDoc}
                  onChange={(e) => setNewDoc(e.target.value)}
                  rows={6}
                />
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddDoc} disabled={addingItem}>
                    {addingItem ? 'Adding...' : 'Add Documentation'}
                  </button>
                </div>
              </div>
            )}

            <div className="items-list">
              {docsList.length === 0 ? (
                <div className="empty-message">
                  <p>No documentation yet.</p>
                  <p className="empty-hint">Add context manually or let AI generate documentation from your schema.</p>
                </div>
              ) : (
                docsList.map((item) => (
                  <div key={item.id} className="item">
                    <div className="item-content">{item.documentation}</div>
                    <div className="item-meta">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDoc(item.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Examples Tab */}
        {activeTab === 'examples' && (
          <>
            <div className="tab-header">
              <h3>Example Queries</h3>
              <div className="tab-header-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleGenerateExamples}
                  disabled={aiLoading || ddlList.length === 0}
                  title={ddlList.length === 0 ? 'Add DDL first' : ''}
                >
                  {aiLoading ? 'Generating...' : 'Generate with AI'}
                </button>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                  Add Example
                </button>
              </div>
            </div>

            {showAddForm && (
              <div className="add-form">
                <div className="form-group">
                  <label className="label">Question</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="How many orders were placed last month?"
                    value={newExample.question}
                    onChange={(e) => setNewExample({ ...newExample, question: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">SQL</label>
                  <textarea
                    className="input textarea"
                    placeholder="SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('month', NOW() - INTERVAL '1 month');"
                    value={newExample.sql}
                    onChange={(e) => setNewExample({ ...newExample, sql: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddExample} disabled={addingItem}>
                    {addingItem ? 'Adding...' : 'Add Example'}
                  </button>
                </div>
              </div>
            )}

            <div className="items-list">
              {examplesList.length === 0 ? (
                <div className="empty-message">
                  <p>No examples yet.</p>
                  <p className="empty-hint">Add question-SQL pairs manually or let AI generate examples from your schema.</p>
                </div>
              ) : (
                examplesList.map((item) => (
                  <div key={item.id} className="item example-item">
                    <div className="example-question">Q: {item.question}</div>
                    <pre className="example-sql">{item.sql}</pre>
                    <div className="item-meta">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExample(item.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* AI Assistant Tab */}
        {activeTab === 'ai' && (
          <>
            <div className="tab-header">
              <h3>AI Assistant</h3>
            </div>

            <div className="ai-assistant">
              <div className="ai-section">
                <h4>Quick Actions</h4>
                <p className="ai-section-description">Use AI to automatically generate training data from your schema.</p>

                <div className="ai-actions-grid">
                  <button
                    className="ai-action-card"
                    onClick={handlePullDDL}
                    disabled={aiLoading}
                  >
                    <div className="ai-action-icon">&#128269;</div>
                    <div className="ai-action-title">Pull DDL</div>
                    <div className="ai-action-description">Extract schema from your connected database</div>
                  </button>

                  <button
                    className="ai-action-card"
                    onClick={handleGenerateDocs}
                    disabled={aiLoading || ddlList.length === 0}
                  >
                    <div className="ai-action-icon">&#128221;</div>
                    <div className="ai-action-title">Generate Docs</div>
                    <div className="ai-action-description">Create documentation from your schema</div>
                  </button>

                  <button
                    className="ai-action-card"
                    onClick={handleGenerateExamples}
                    disabled={aiLoading || ddlList.length === 0}
                  >
                    <div className="ai-action-icon">&#128161;</div>
                    <div className="ai-action-title">Generate Examples</div>
                    <div className="ai-action-description">Create sample SQL queries</div>
                  </button>

                  <button
                    className="ai-action-card"
                    onClick={handleAnalyzeSchema}
                    disabled={aiLoading || ddlList.length === 0}
                  >
                    <div className="ai-action-icon">&#128202;</div>
                    <div className="ai-action-title">Analyze Schema</div>
                    <div className="ai-action-description">Get insights and suggestions</div>
                  </button>
                </div>

                {ddlList.length === 0 && (
                  <p className="ai-hint">Add DDL to your database first to enable AI features.</p>
                )}
              </div>

              {/* Schema Analysis Results */}
              {schemaAnalysis && (
                <div className="ai-section">
                  <h4>Schema Analysis</h4>

                  <div className="analysis-grid">
                    <div className="analysis-card">
                      <div className="analysis-stat">{schemaAnalysis.tables.length}</div>
                      <div className="analysis-label">Tables</div>
                    </div>
                    <div className="analysis-card">
                      <div className="analysis-stat">{schemaAnalysis.total_columns}</div>
                      <div className="analysis-label">Columns</div>
                    </div>
                    <div className="analysis-card">
                      <div className="analysis-stat">{schemaAnalysis.relationships.length}</div>
                      <div className="analysis-label">Relationships</div>
                    </div>
                  </div>

                  {schemaAnalysis.relationships.length > 0 && (
                    <div className="analysis-section">
                      <h5>Relationships</h5>
                      <ul className="analysis-list">
                        {schemaAnalysis.relationships.map((rel, idx) => (
                          <li key={idx}>
                            <strong>{rel.from_table}</strong> → <strong>{rel.to_table}</strong>
                            <span className="badge badge-secondary">{rel.type}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {schemaAnalysis.query_patterns.length > 0 && (
                    <div className="analysis-section">
                      <h5>Common Query Patterns</h5>
                      <ul className="analysis-list">
                        {schemaAnalysis.query_patterns.map((pattern, idx) => (
                          <li key={idx}>{pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Documentation Suggestions */}
              {docSuggestions.length > 0 && (
                <div className="ai-section">
                  <h4>Documentation Suggestions</h4>
                  <p className="ai-section-description">Topics that could use more documentation:</p>
                  <ul className="suggestions-list">
                    {docSuggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
