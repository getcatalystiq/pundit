import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Callback() {
  const { processCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await processCallback();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [processCallback]);

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
