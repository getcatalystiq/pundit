import { useAuth } from '../auth/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Login() {
  const { isLoggedIn, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-700">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-700">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-bold">Pundit</CardTitle>
          <CardDescription>Database Tools Admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <Button className="w-full py-6 text-base" onClick={login}>
            Sign in with OAuth
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Sign in with your organization credentials to manage databases, training data, and users.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
