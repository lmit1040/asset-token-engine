import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import AssetsPage from "./pages/AssetsPage";
import NewAssetPage from "./pages/NewAssetPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import TokensPage from "./pages/TokensPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAssignPage from "./pages/AdminAssignPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/new" element={<NewAssetPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/assign" element={<AdminAssignPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
