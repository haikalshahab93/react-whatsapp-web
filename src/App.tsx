import React, { useEffect } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import "./App.css";
import Homepage from "./feature/pages/homepage/Homepage";
import LoginPage from "./feature/pages/auth/Login";
import RegisterPage from "./feature/pages/auth/Register";
import VerifyPage from "./feature/pages/auth/Verify";
import InvitePage from "./feature/pages/invite/Invite";

function useAuth() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem("chateasy_token"));
  React.useEffect(() => {
    // keep token in sync on tab focus (optional)
    const update = () => setToken(localStorage.getItem("chateasy_token"));
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);
  return token;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    document.title = "ChatEasy";
  }, []);

  const router = createBrowserRouter(
    [
      { path: "/", element: <RequireAuth><Homepage /></RequireAuth> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/verify", element: <VerifyPage /> },
      { path: "/invite", element: <RequireAuth><InvitePage /></RequireAuth> },
    ],
    {
      // Cast to any to allow enabling v7_startTransition on react-router-dom 6.23 typings
      future: ({ v7_relativeSplatPath: true, v7_startTransition: true } as any),
    }
  );

  return <RouterProvider router={router} />;
}

export default App;
