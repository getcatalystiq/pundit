"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  isAuthenticated,
  getStoredUserInfo,
  fetchUserInfo,
  startAuthFlow,
  handleCallback,
  logout as oauthLogout,
  getAccessToken,
  UserInfo,
} from "./oauth-client";

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: () => Promise<void>;
  logout: () => void;
  processCallback: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (isAuthenticated()) {
        try {
          const storedUser = getStoredUserInfo();
          if (storedUser) {
            setUser(storedUser);
          } else {
            const userInfo = await fetchUserInfo();
            setUser(userInfo);
          }
        } catch (error) {
          console.error("Failed to restore session:", error);
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
    window.location.href = "/";
  };

  const processCallback = async () => {
    setIsLoading(true);
    try {
      const userInfo = await handleCallback();
      setUser(userInfo);
      return true;
    } catch (error) {
      console.error("Callback processing failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getToken = async () => {
    return getAccessToken();
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
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
