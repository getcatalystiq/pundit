"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function CallbackContent() {
  const { processCallback, isLoggedIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (isLoggedIn) {
      router.replace("/dashboard");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      router.replace("/login");
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;

    const handleCallback = async () => {
      try {
        await processCallback();
        router.replace("/dashboard");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Authentication failed"
        );
      }
    };

    handleCallback();
  }, [processCallback, router, isLoggedIn]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-700">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4 text-sm">
              {error}
            </div>
            <Button asChild className="w-full">
              <a href="/login">Try Again</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-700">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Completing sign in...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <AuthProvider>
      <CallbackContent />
    </AuthProvider>
  );
}
