import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WalletProvider } from "@/hooks/useWallet";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import AssetsPage from "./pages/AssetsPage";
import NewAssetPage from "./pages/NewAssetPage";
import EditAssetPage from "./pages/EditAssetPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import TokensPage from "./pages/TokensPage";
import ProfilePage from "./pages/ProfilePage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAssignPage from "./pages/AdminAssignPage";
import AdminTransferPage from "./pages/AdminTransferPage";
import AdminActivityPage from "./pages/AdminActivityPage";
import AdminDeliverPage from "./pages/AdminDeliverPage";
import AdminAttestationsPage from "./pages/AdminAttestationsPage";
import AdminFeePayersPage from "./pages/AdminFeePayersPage";
import AdminArchivedPage from "./pages/AdminArchivedPage";
import MxuBenefitsPage from "./pages/MxuBenefitsPage";
import GovernancePage from "./pages/GovernancePage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import TransfersPage from "./pages/TransfersPage";
import SubmitAssetPage from "./pages/SubmitAssetPage";
import MySubmissionsPage from "./pages/MySubmissionsPage";
import AdminSubmissionsPage from "./pages/AdminSubmissionsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WalletProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/assets/new" element={<NewAssetPage />} />
              <Route path="/assets/:id/edit" element={<EditAssetPage />} />
              <Route path="/assets/:id" element={<AssetDetailPage />} />
              <Route path="/tokens" element={<TokensPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/submit-asset" element={<SubmitAssetPage />} />
              <Route path="/my-submissions" element={<MySubmissionsPage />} />
              <Route path="/mxu-benefits" element={<MxuBenefitsPage />} />
              <Route path="/governance" element={<GovernancePage />} />
              <Route path="/governance/:id" element={<ProposalDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/assign" element={<AdminAssignPage />} />
              <Route path="/admin/transfer" element={<AdminTransferPage />} />
              <Route path="/admin/deliver" element={<AdminDeliverPage />} />
              <Route path="/admin/attestations" element={<AdminAttestationsPage />} />
              <Route path="/admin/submissions" element={<AdminSubmissionsPage />} />
              <Route path="/admin/fee-payers" element={<AdminFeePayersPage />} />
              <Route path="/admin/archived" element={<AdminArchivedPage />} />
              <Route path="/admin/activity" element={<AdminActivityPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WalletProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
