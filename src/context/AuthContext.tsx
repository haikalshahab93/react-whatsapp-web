import React from "react";
import { api, ApiError, clearSession, getStoredUser, getToken, storeSession, storeUser } from "../lib/api";
import { resetSocket } from "../lib/socket";
import type { User } from "../lib/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  inviter?: string;
  birthdate?: string;
  gender?: string;
  bio?: string;
  interests?: string[];
}

interface RegisterResult {
  verificationToken?: string;
  userId?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<RegisterResult>;
  logout: () => void;
  refresh: () => Promise<void>;
  updateUser: (patch: Partial<User>) => Promise<User>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

const USER_ID = (user: User | null): string => String(user?._id || user?.id || "");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => getToken());
  const [user, setUser] = React.useState<User | null>(() => getStoredUser());
  const [status, setStatus] = React.useState<AuthStatus>(() => (getToken() ? "loading" : "anonymous"));

  const bootstrap = React.useCallback(async () => {
    const existing = getToken();
    if (!existing) {
      setStatus("anonymous");
      setUser(null);
      setToken(null);
      return;
    }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      storeUser(me);
      setToken(existing);
      setStatus("authenticated");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        resetSocket();
        setUser(null);
        setToken(null);
        setStatus("anonymous");
      } else {
        // Network hiccup: keep the cached session so the app stays usable offline.
        setStatus(getStoredUser() ? "authenticated" : "anonymous");
      }
    }
  }, []);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = React.useCallback(async (email: string, password: string) => {
    const result = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    storeSession(result.token, result.user);
    resetSocket();
    setToken(result.token);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const register = React.useCallback(async (payload: RegisterPayload) => {
    const result = await api<RegisterResult>("/auth/register", {
      method: "POST",
      auth: false,
      body: payload,
    });
    return result;
  }, []);

  const logout = React.useCallback(() => {
    clearSession();
    resetSocket();
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refresh = React.useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  const updateUser = React.useCallback(async (patch: Partial<User>) => {
    const updated = await api<User>("/users/me", { method: "PUT", body: patch });
    setUser(updated);
    storeUser(updated);
    return updated;
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, token, status, login, register, logout, refresh, updateUser }),
    [user, token, status, login, register, logout, refresh, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUserId(): string {
  const { user } = useAuth();
  return USER_ID(user);
}
