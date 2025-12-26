import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  isAuthenticated,
  getStoredUserInfo,
  fetchUserInfo,
  startAuthFlow,
  handleCallback,
  logout as oauthLogout,
} from './oauth';

interface UserInfo {
  sub: string;
  email: string;
  name?: string;
  tenant_id: string;
  role: string;
  scopes: string[];
}

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: () => Promise<void>;
  logout: () => void;
  processCallback: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const initAuth = async () => {
      if (isAuthenticated()) {
        try {
          // Try to get stored user info first
          const storedUser = getStoredUserInfo();
          if (storedUser) {
            setUser(storedUser);
          } else {
            // Fetch fresh user info
            const userInfo = await fetchUserInfo();
            setUser(userInfo);
          }
        } catch (error) {
          console.error('Failed to restore session:', error);
          oauthLogout();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async () => {
    await startAuthFlow();
  };

  const logout = () => {
    oauthLogout();
    setUser(null);
    window.location.href = '/';
  };

  const processCallback = async () => {
    setIsLoading(true);
    try {
      const userInfo = await handleCallback();
      setUser(userInfo);
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Callback processing failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        logout,
        processCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
