import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Setup } from "./pages/Setup";
import { Search } from "./pages/Search";
import { SchoolProfile } from "./pages/SchoolProfile";
import { SavedSchools } from "./pages/SavedSchools";
import { Admin } from "./pages/Admin";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";
import { HomeRedirect } from "./routes/HomeRedirect";

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <Register />
          </PublicOnlyRoute>
        }
      />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* /setup must be accessible while logged in so existing users can bootstrap admin */}
      <Route path="/setup" element={<Setup />} />

      {/* Protected */}
      <Route
        path="/app/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/schools/:id"
        element={
          <ProtectedRoute>
            <SchoolProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/saved"
        element={
          <ProtectedRoute>
            <SavedSchools />
          </ProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/app/admin"
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}