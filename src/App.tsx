import React from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import "./App.css";
import Homepage from "./feature/pages/homepage/Homepage";
import LoginPage from "./feature/pages/auth/Login";
import RegisterPage from "./feature/pages/auth/Register";
import VerifyPage from "./feature/pages/auth/Verify";
import ResetPasswordPage from "./feature/pages/auth/ResetPassword";
import InvitePage from "./feature/pages/invite/Invite";
import DiscoverPage from "./feature/pages/discover/Discover";
import FriendsPage from "./feature/pages/friends/Friends";
import ProfilePage from "./feature/pages/profile/Profile";
import AppShell from "./components/AppShell";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ColorModeProvider } from "./context/ColorModeContext";
import { ToastProvider } from "./context/ToastContext";

function Splash() {
  return (
    <Box sx={{ height: "100dvh", display: "grid", placeItems: "center", gap: 2 }}>
      <Box sx={{ textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading ChatEasy…
        </Typography>
      </Box>
    </Box>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authenticated") return <Navigate to="/chats" replace />;
  return <>{children}</>;
}

function ProtectedLayout() {
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

function NotFound() {
  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", p: 4, textAlign: "center" }}>
      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>
          404
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          That page does not exist.
        </Typography>
        <Button variant="contained" href="/chats">
          Back to chats
        </Button>
      </Box>
    </Box>
  );
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Navigate to="/chats" replace />,
    },
    {
      element: <ProtectedLayout />,
      children: [
        { path: "/chats", element: <Homepage /> },
        { path: "/discover", element: <DiscoverPage /> },
        { path: "/friends", element: <FriendsPage /> },
        { path: "/profile", element: <ProfilePage /> },
        { path: "/invite", element: <InvitePage /> },
      ],
    },
    {
      path: "/login",
      element: (
        <PublicOnly>
          <LoginPage />
        </PublicOnly>
      ),
    },
    {
      path: "/register",
      element: (
        <PublicOnly>
          <RegisterPage />
        </PublicOnly>
      ),
    },
    { path: "/verify", element: <VerifyPage /> },
    { path: "/reset-password", element: <ResetPasswordPage /> },
    {
      element: <ProtectedLayout />,
      children: [{ path: "*", element: <NotFound /> }],
    },
  ],
  {
    future: { v7_relativeSplatPath: true, v7_startTransition: true } as unknown as Record<string, boolean>,
  }
);

function App() {
  React.useEffect(() => {
    document.title = "ChatEasy — private messaging & nearby friends";
  }, []);

  return (
    <ColorModeProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </ColorModeProvider>
  );
}

export default App;
