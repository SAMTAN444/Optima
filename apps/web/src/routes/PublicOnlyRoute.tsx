import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageSkeleton } from "../components/LoadingSkeleton";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  console.log("[PublicOnlyRoute]", { loading, userId: user?.id ?? null, path: window.location.pathname });

  if (loading) return <PageSkeleton />;
  if (user) return <Navigate to="/app/search" replace />;

  return <>{children}</>;
}