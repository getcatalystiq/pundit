import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

export function Callback() {
  const { processCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await processCallback();
        // processCallback redirects to / on success
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [processCallback]);

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-error">{error}</div>
          <a href="/login" className="btn btn-primary btn-login">
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <p>Completing sign in...</p>
      </div>
    </div>
  );
}
