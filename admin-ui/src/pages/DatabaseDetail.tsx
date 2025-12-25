import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  databases, ddl, docs, examples, ai,
  Database, DDLEntry, DocEntry, ExampleEntry,
  GeneratedExample, SchemaAnalysis, TestConnectionResponse
} from '../api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Search, FileText, Lightbulb, BarChart3, Loader2, CheckCircle, XCircle } from 'lucide-react';

type TabType = 'ddl' | 'docs' | 'examples' | 'ai';

export function DatabaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [database, setDatabase] = useState<Database | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('ddl');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [ddlList, setDdlList] = useState<DDLEntry[]>([]);
  const [docsList, setDocsList] = useState<DocEntry[]>([]);
  const [examplesList, setExamplesList] = useState<ExampleEntry[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newDdl, setNewDdl] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [newExample, setNewExample] = useState({ question: '', sql: '' });

  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const [aiPreviewType, setAiPreviewType] = useState<'ddl' | 'docs' | 'examples'>('ddl');
  const [aiPreviewContent, setAiPreviewContent] = useState<string>('');
  const [aiPreviewDdlByTable, setAiPreviewDdlByTable] = useState<Record<string, string>>({});
  const [aiPreviewDocsByTable, setAiPreviewDocsByTable] = useState<Record<string, string>>({});
  const [aiPreviewExamples, setAiPreviewExamples] = useState<GeneratedExample[]>([]);
  const [schemaAnalysis, setSchemaAnalysis] = useState<SchemaAnalysis | null>(null);
  const [docSuggestions, setDocSuggestions] = useState<string[]>([]);

  // Connection test state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<TestConnectionResponse | null>(null);

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
      setDdlList(ddlData?.ddl || []);
      setDocsList(docsData?.documentation || []);
      setExamplesList(examplesData?.examples || []);
    } catch (err) {
      console.error('Failed to load training data:', err);
      setDdlList([]);
      setDocsList([]);
      setExamplesList([]);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    setError(null);
    try {
      const result = await databases.testConnection(id!);
      setConnectionResult(result);
      if (result.success) {
        showSuccess('Connection successful!');
      }
    } catch (err: unknown) {
      const error = err as { error?: string };
      setConnectionResult({
        success: false,
        message: error.error || 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

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

  const handlePullDDL = async () => {
    setAiLoading(true);
    setError(null);
    try {
      const response = await ai.pullDDL(id!, { schema: 'public' });
      setAiPreviewType('ddl');
      setAiPreviewDdlByTable(response.ddl_by_table);
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
      // Store raw per-table docs for saving
      setAiPreviewDocsByTable(response.documentation);
      // Convert per-table documentation to formatted string for preview
      const formattedDocs = Object.entries(response.documentation)
        .map(([table, doc]) => `## Table: ${table}\n\n${doc}`)
        .join('\n\n---\n\n');
      setAiPreviewContent(formattedDocs);
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
        const tables = Object.entries(aiPreviewDdlByTable);
        for (const [, tableDdl] of tables) {
          await ddl.add(id!, tableDdl);
        }
        showSuccess(`${tables.length} table DDL entries saved successfully`);
      } else if (aiPreviewType === 'docs') {
        // Save each table's documentation as a separate row
        const tables = Object.entries(aiPreviewDocsByTable);
        for (const [tableName, docContent] of tables) {
          // Prefix with table header for clarity
          await docs.add(id!, `## Table: ${tableName}\n\n${docContent}`);
        }
        showSuccess(`${tables.length} documentation entries saved successfully`);
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
    return <LoadingState message="Loading database details..." />;
  }

  if (!database) {
    return <div className="flex items-center justify-center h-64">Database not found</div>;
  }

  const tabs = [
    { id: 'ddl' as const, label: 'DDL', count: ddlList.length },
    { id: 'docs' as const, label: 'Documentation', count: docsList.length },
    { id: 'examples' as const, label: 'Examples', count: examplesList.length },
    { id: 'ai' as const, label: 'AI Assistant', count: null },
  ];

  return (
    <div>
      <header className="mb-8">
        <div className="text-sm text-muted-foreground mb-2">
          <Link to="/databases" className="hover:text-foreground">Databases</Link>
          <span className="mx-2">/</span>
          <span>{database.name}</span>
        </div>
        <h1 className="text-2xl font-bold font-serif text-foreground">{database.name}</h1>
        <div className="flex items-center gap-4 mt-3">
          <p className="text-muted-foreground">
            {database.db_type} &middot;{' '}
            <span className={database.enabled ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
              {database.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testingConnection}
          >
            {testingConnection ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          {connectionResult && (
            <div className={cn(
              "flex items-center gap-2 text-sm",
              connectionResult.success ? "text-green-600 dark:text-green-400" : "text-destructive"
            )}>
              {connectionResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span>{connectionResult.message}</span>
              {connectionResult.details?.latency_ms && (
                <span className="text-muted-foreground">({connectionResult.details.latency_ms}ms)</span>
              )}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-md p-3 mb-4 text-sm">
          {successMessage}
        </div>
      )}

      <div className="flex gap-1 border-b border-border mb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => { setActiveTab(tab.id); setShowAddForm(false); }}
          >
            {tab.label}
            {tab.count !== null && <span className="ml-1 text-xs">({tab.count})</span>}
          </button>
        ))}
      </div>

      <Dialog open={showAiPreview} onOpenChange={setShowAiPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {aiPreviewType === 'ddl' && 'Pulled Schema DDL'}
              {aiPreviewType === 'docs' && 'Generated Documentation'}
              {aiPreviewType === 'examples' && 'Generated Examples'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Review the AI-generated content before saving</p>

          <div className="mt-4">
            {aiPreviewType === 'ddl' && (
              <div className="space-y-4">
                {Object.entries(aiPreviewDdlByTable).map(([tableName, tableDdl]) => (
                  <div key={tableName} className="border border-border rounded-md p-4">
                    <div className="text-sm font-medium mb-2">{tableName}</div>
                    <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap break-words">{tableDdl}</pre>
                  </div>
                ))}
              </div>
            )}

            {aiPreviewType === 'docs' && (
              <Textarea
                className="font-mono text-sm min-h-[300px]"
                value={aiPreviewContent}
                onChange={(e) => setAiPreviewContent(e.target.value)}
              />
            )}

            {aiPreviewType === 'examples' && (
              <div className="space-y-4">
                {aiPreviewExamples.map((example, idx) => (
                  <div key={idx} className="border border-border rounded-md p-4">
                    <div className="text-sm font-medium mb-2">Q: {example.question}</div>
                    <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap break-words">{example.sql}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAiContent} disabled={addingItem}>
              {addingItem ? 'Saving...' : 'Save to Training Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-t-none border-t-0">
        <CardContent className="p-6">
          {activeTab === 'ddl' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-medium">Schema Definitions</h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePullDDL} disabled={aiLoading}>
                    {aiLoading ? 'Pulling...' : 'Pull from Database'}
                  </Button>
                  <Button onClick={() => setShowAddForm(true)}>Add DDL</Button>
                </div>
              </div>

              {showAddForm && (
                <div className="mb-6 p-4 border border-border rounded-lg bg-muted/50">
                  <Textarea
                    className="font-mono text-sm mb-3"
                    placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL&#10;);"
                    value={newDdl}
                    onChange={(e) => setNewDdl(e.target.value)}
                    rows={6}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button onClick={handleAddDdl} disabled={addingItem}>
                      {addingItem ? 'Adding...' : 'Add DDL'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {ddlList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No DDL entries yet.</p>
                    <p className="text-sm mt-1">Add schema definitions manually or pull from your connected database.</p>
                  </div>
                ) : (
                  ddlList.map((item) => (
                    <div key={item.id} className="border border-border rounded-lg p-4">
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto mb-3">{item.ddl}</pre>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteDdl(item.id)}>Delete</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'docs' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-medium">Documentation</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleGenerateDocs}
                    disabled={aiLoading || ddlList.length === 0}
                  >
                    {aiLoading ? 'Generating...' : 'Generate with AI'}
                  </Button>
                  <Button onClick={() => setShowAddForm(true)}>Add Doc</Button>
                </div>
              </div>

              {showAddForm && (
                <div className="mb-6 p-4 border border-border rounded-lg bg-muted/50">
                  <Textarea
                    className="mb-3"
                    placeholder="Document business rules, column meanings, or important context..."
                    value={newDoc}
                    onChange={(e) => setNewDoc(e.target.value)}
                    rows={6}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button onClick={handleAddDoc} disabled={addingItem}>
                      {addingItem ? 'Adding...' : 'Add Documentation'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {docsList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No documentation yet.</p>
                    <p className="text-sm mt-1">Add context manually or let AI generate documentation from your schema.</p>
                  </div>
                ) : (
                  docsList.map((item) => (
                    <div key={item.id} className="border border-border rounded-lg p-4">
                      <div className="whitespace-pre-wrap mb-3">{item.documentation}</div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteDoc(item.id)}>Delete</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'examples' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-medium">Example Queries</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleGenerateExamples}
                    disabled={aiLoading || ddlList.length === 0}
                  >
                    {aiLoading ? 'Generating...' : 'Generate with AI'}
                  </Button>
                  <Button onClick={() => setShowAddForm(true)}>Add Example</Button>
                </div>
              </div>

              {showAddForm && (
                <div className="mb-6 p-4 border border-border rounded-lg bg-muted/50 space-y-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Input
                      placeholder="How many orders were placed last month?"
                      value={newExample.question}
                      onChange={(e) => setNewExample({ ...newExample, question: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SQL</Label>
                    <Textarea
                      className="font-mono text-sm"
                      placeholder="SELECT COUNT(*) FROM orders WHERE created_at >= ..."
                      value={newExample.sql}
                      onChange={(e) => setNewExample({ ...newExample, sql: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button onClick={handleAddExample} disabled={addingItem}>
                      {addingItem ? 'Adding...' : 'Add Example'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {examplesList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No examples yet.</p>
                    <p className="text-sm mt-1">Add question-SQL pairs manually or let AI generate examples.</p>
                  </div>
                ) : (
                  examplesList.map((item) => (
                    <div key={item.id} className="border border-border rounded-lg p-4">
                      <div className="font-medium mb-2">Q: {item.question}</div>
                      <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap break-words mb-3">{item.sql}</pre>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteExample(item.id)}>Delete</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'ai' && (
            <>
              <div className="mb-6">
                <h3 className="font-medium mb-2">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">Use AI to automatically generate training data from your schema.</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <button
                  className="flex flex-col items-center p-6 border border-border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={handlePullDDL}
                  disabled={aiLoading}
                >
                  <Search className="h-8 w-8 mb-2 text-muted-foreground" />
                  <div className="font-medium">Pull DDL</div>
                  <div className="text-xs text-muted-foreground text-center mt-1">Extract schema from database</div>
                </button>

                <button
                  className="flex flex-col items-center p-6 border border-border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={handleGenerateDocs}
                  disabled={aiLoading || ddlList.length === 0}
                >
                  <FileText className="h-8 w-8 mb-2 text-muted-foreground" />
                  <div className="font-medium">Generate Docs</div>
                  <div className="text-xs text-muted-foreground text-center mt-1">Create documentation</div>
                </button>

                <button
                  className="flex flex-col items-center p-6 border border-border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={handleGenerateExamples}
                  disabled={aiLoading || ddlList.length === 0}
                >
                  <Lightbulb className="h-8 w-8 mb-2 text-muted-foreground" />
                  <div className="font-medium">Generate Examples</div>
                  <div className="text-xs text-muted-foreground text-center mt-1">Create sample queries</div>
                </button>

                <button
                  className="flex flex-col items-center p-6 border border-border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={handleAnalyzeSchema}
                  disabled={aiLoading || ddlList.length === 0}
                >
                  <BarChart3 className="h-8 w-8 mb-2 text-muted-foreground" />
                  <div className="font-medium">Analyze Schema</div>
                  <div className="text-xs text-muted-foreground text-center mt-1">Get insights</div>
                </button>
              </div>

              {ddlList.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-6">Add DDL to your database first to enable AI features.</p>
              )}

              {schemaAnalysis && (
                <div className="mb-8">
                  <h4 className="font-medium mb-4">Schema Analysis</h4>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold">{schemaAnalysis.tables.length}</div>
                        <div className="text-sm text-muted-foreground">Tables</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold">{schemaAnalysis.total_columns}</div>
                        <div className="text-sm text-muted-foreground">Columns</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold">{schemaAnalysis.relationships.length}</div>
                        <div className="text-sm text-muted-foreground">Relationships</div>
                      </CardContent>
                    </Card>
                  </div>

                  {schemaAnalysis.relationships.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-sm font-medium mb-2">Relationships</h5>
                      <ul className="space-y-1 text-sm">
                        {schemaAnalysis.relationships.map((rel, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="font-medium">{rel.from_table}</span>
                            <span>→</span>
                            <span className="font-medium">{rel.to_table}</span>
                            <Badge variant="secondary">{rel.type}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {schemaAnalysis.query_patterns.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Common Query Patterns</h5>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        {schemaAnalysis.query_patterns.map((pattern, idx) => (
                          <li key={idx}>{pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {docSuggestions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Documentation Suggestions</h4>
                  <p className="text-sm text-muted-foreground mb-3">Topics that could use more documentation:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {docSuggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
