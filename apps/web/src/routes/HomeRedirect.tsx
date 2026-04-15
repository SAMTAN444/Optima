import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Landing } from "../pages/Landing";
import { PageSkeleton } from "../components/LoadingSkeleton";

export function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return <PageSkeleton />;

  // Logged in → go straight into the app
  if (user) return <Navigate to="/app/search" replace />;

  // Not logged in → show marketing/landing
  return <Landing />;
}