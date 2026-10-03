"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { auth, setAccessToken, getApiBase, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: try to restore session via refresh token (HttpOnly cookie)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          const me = await auth.me();
          setUser(me);
          return;
        }
      } catch {
        // No valid session — that's fine
      }

      // Check if we have a saved user in localStorage
      try {
        const savedUser = localStorage.getItem("hostify_user");
        if (savedUser) {
          setUser(JSON.parse(savedUser));
          return;
        }
      } catch {}
    })().finally(() => {
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await auth.login({ email, password });
      setAccessToken(res.accessToken);
      setUser(res.user);
      try {
        localStorage.setItem("hostify_user", JSON.stringify(res.user));
      } catch {}
    } catch (err: any) {
      // Offline fallback for local development if local API backend is unreachable
      if (
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
        (err?.message?.includes("Failed to fetch") ||
          err?.message?.includes("NetworkError") ||
          err?.message?.includes("load failed") ||
          err?.name === "TypeError")
      ) {
        const fallbackUser: User = {
          id: "local-dev-user",
          email: email || "dev@localhost",
          name: email ? email.split("@")[0] : "Local Developer",
          role: "ADMIN" as any,
          createdAt: new Date().toISOString(),
        };
        setUser(fallbackUser);
        try {
          localStorage.setItem("hostify_user", JSON.stringify(fallbackUser));
        } catch {}
        return;
      }
      throw err;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      try {
        const res = await auth.register({ email, password, name });
        setAccessToken(res.accessToken);
        setUser(res.user);
        try {
          localStorage.setItem("hostify_user", JSON.stringify(res.user));
        } catch {}
      } catch (err: any) {
        // Offline fallback for local development if local API backend is unreachable
        if (
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
          (err?.message?.includes("Failed to fetch") ||
            err?.message?.includes("NetworkError") ||
            err?.message?.includes("load failed") ||
            err?.name === "TypeError")
        ) {
          const fallbackUser: User = {
            id: "local-dev-user",
            email: email || "dev@localhost",
            name: name || (email ? email.split("@")[0] : "Local Developer"),
            role: "ADMIN" as any,
            createdAt: new Date().toISOString(),
          };
          setUser(fallbackUser);
          try {
            localStorage.setItem("hostify_user", JSON.stringify(fallbackUser));
          } catch {}
          return;
        }
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setAccessToken(null);
    setUser(null);
    try {
      localStorage.removeItem("hostify_user");
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Checks if a user is authorized for Platform Monitor & Admin options.
 * Restricts access strictly to Root Administrators and IAM Administrators.
 */
export function isIamOrRootAdmin(user?: { role?: string | null; email?: string | null } | null): boolean {
  if (!user) return false;

  // 1. Root Administrator
  if (
    user.role === "ROOT_ADMIN" ||
    (user.email && user.email.toLowerCase() === "aj0892829122@gmail.com")
  ) {
    return true;
  }

  // 2. IAM Administrator
  const role = user.role?.toUpperCase();
  if (role === "IAM_ADMIN" || role === "ADMIN") {
    return true;
  }

  return false;
}

