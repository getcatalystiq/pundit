"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DatabaseDetail {
  id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_mode: string;
  is_default: boolean;
  enabled: boolean;
}

interface TrainingData {
  ddl_count: number;
  doc_count: number;
  example_count: number;
  memory_count: number;
  text_memory_count: number;
}

type Tab = "ddl" | "docs" | "examples" | "text-memory" | "tool-memory" | "ai";

export default function DatabaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [db, setDb] = useState<DatabaseDetail | null>(null);
  const [training, setTraining] = useState<TrainingData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("ddl");
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetchWithAuth(`/api/admin/databases/${id}`);
        const data = await response.json();
        setDb(data.database);
        setTraining(data.training_data);
      } catch {
        router.push("/databases");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, router]);

  const handleTestConnection = async () => {
    setTestResult("Testing...");
    try {
      const response = await fetchWithAuth(
        `/api/admin/databases/${id}/test-connection`,
        { method: "POST" }
      );
      const data = await response.json();
      setTestResult(
        data.success
          ? `Connected! ${data.version} (${data.latency_ms}ms)`
          : `Failed: ${data.error}`
      );
    } catch {
      setTestResult("Connection test failed");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this database and ALL training data?")) return;
    try {
      await fetchWithAuth(`/api/admin/databases/${id}`, {
        method: "DELETE",
      });
      router.push("/databases");
    } catch {
      alert("Failed to delete database");
    }
  };

  const handleAiAction = async (action: string) => {
    setAiLoading(action);
    setAiResult(null);
    try {
      const response = await fetchWithAuth(
        `/api/admin/databases/${id}/ai/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ auto_save: true }),
        }
      );
      const data = await response.json();
      setAiResult(`${action}: ${JSON.stringify(data).slice(0, 200)}...`);
      // Refresh training data counts
      const dbResponse = await fetchWithAuth(`/api/admin/databases/${id}`);
      const dbData = await dbResponse.json();
      setTraining(dbData.training_data);
    } catch (err: unknown) {
      setAiResult(`Error: ${(err as { error?: string })?.error || "Failed"}`);
    } finally {
      setAiLoading(null);
    }
  };

  if (loading || !db) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "ddl", label: "DDL", count: Number(training?.ddl_count) || 0 },
    { key: "docs", label: "Documentation", count: Number(training?.doc_count) || 0 },
    { key: "examples", label: "Examples", count: Number(training?.example_count) || 0 },
    { key: "text-memory", label: "Text Memory", count: Number(training?.text_memory_count) || 0 },
    { key: "tool-memory", label: "Tool Memory", count: Number(training?.memory_count) || 0 },
    { key: "ai", label: "AI Assistant" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{db.name}</h1>
          <p className="text-muted-foreground">
            {db.host}:{db.port}/{db.database_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTestConnection}>
            Test Connection
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {testResult && (
        <div className="mb-4 p-3 rounded-md border text-sm">{testResult}</div>
      )}

      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({tab.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "ai" ? (
        <Card>
          <CardHeader>
            <CardTitle>AI Assistant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={() => handleAiAction("pull-ddl")}
                disabled={!!aiLoading}
              >
                {aiLoading === "pull-ddl" ? "Pulling..." : "Pull DDL from Database"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAiAction("generate-docs")}
                disabled={!!aiLoading}
              >
                {aiLoading === "generate-docs" ? "Generating..." : "Generate Documentation"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAiAction("generate-examples")}
                disabled={!!aiLoading}
              >
                {aiLoading === "generate-examples" ? "Generating..." : "Generate Examples"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAiAction("analyze")}
                disabled={!!aiLoading}
              >
                {aiLoading === "analyze" ? "Analyzing..." : "Analyze Schema"}
              </Button>
            </div>
            {aiResult && (
              <pre className="p-4 bg-muted rounded-md text-sm overflow-x-auto whitespace-pre-wrap">
                {aiResult}
              </pre>
            )}
          </CardContent>
        </Card>
      ) : (
        <TrainingDataTab databaseId={id} tab={activeTab} />
      )}
    </div>
  );
}

function TrainingDataTab({
  databaseId,
  tab,
}: {
  databaseId: string;
  tab: Tab;
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const endpointMap: Record<string, string> = {
    ddl: "ddl",
    docs: "docs",
    examples: "examples",
    "text-memory": "text-memory",
    "tool-memory": "tool-memory",
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/admin/databases/${databaseId}/${endpointMap[tab]}`
      );
      const data = await response.json();
      // API returns different keys for each type
      const values = Object.values(data)[0];
      setItems(Array.isArray(values) ? values : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [databaseId, tab]);

  const handleDelete = async (itemId: string) => {
    const paramMap: Record<string, string> = {
      ddl: "ddlId",
      docs: "docId",
      examples: "exampleId",
      "text-memory": "memoryId",
      "tool-memory": "memoryId",
    };
    try {
      await fetchWithAuth(
        `/api/admin/databases/${databaseId}/${endpointMap[tab]}?${paramMap[tab]}=${itemId}`,
        { method: "DELETE" }
      );
      await fetchItems();
    } catch {
      alert("Failed to delete item");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse bg-muted rounded" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          No {tab} entries yet. Use the AI Assistant tab to generate content.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id as string}>
          <CardContent className="p-4 flex items-start justify-between gap-4">
            <pre className="flex-1 text-sm overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
              {(item.ddl || item.documentation || item.question || item.content || item.sql_text || JSON.stringify(item, null, 2)) as string}
            </pre>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(item.id as string)}
            >
              Delete
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
