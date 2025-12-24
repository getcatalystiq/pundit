import { useAuth } from '../auth/AuthContext';
import { Navigate } from 'react-router-dom';
import './Login.css';

export function Login() {
  const { isLoggedIn, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Pundit</h1>
          <p>Database Tools Admin</p>
        </div>

        <button className="btn btn-primary btn-login" onClick={login}>
          Sign in with OAuth
        </button>

        <p className="login-footer">
          Sign in with your organization credentials to manage databases, training data, and users.
        </p>
      </div>
    </div>
  );
}
