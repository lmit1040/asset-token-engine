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
import AdminTokenOperationsPage from "./pages/AdminTokenOperationsPage";
import AdminAttestationsPage from "./pages/AdminAttestationsPage";
import AdminFeePayersPage from "./pages/AdminFeePayersPage";
import AdminEvmFeePayersPage from "./pages/AdminEvmFeePayersPage";
import AdminArchivedPage from "./pages/AdminArchivedPage";
import AdminArbitrageStrategiesPage from "./pages/AdminArbitrageStrategiesPage";
import AdminArbitrageRunsPage from "./pages/AdminArbitrageRunsPage";
import AdminAutomatedArbitragePage from "./pages/AdminAutomatedArbitragePage";
import AdminFlashLoanProvidersPage from "./pages/AdminFlashLoanProvidersPage";
import MxuBenefitsPage from "./pages/MxuBenefitsPage";
import GovernancePage from "./pages/GovernancePage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import TransfersPage from "./pages/TransfersPage";
import SubmitAssetPage from "./pages/SubmitAssetPage";
import MySubmissionsPage from "./pages/MySubmissionsPage";
import AdminSubmissionsPage from "./pages/AdminSubmissionsPage";
import AdminNewsPage from "./pages/AdminNewsPage";
import AdminTokenProposalsPage from "./pages/AdminTokenProposalsPage";
import ProofOfReservePage from "./pages/ProofOfReservePage";
import AdminLaunchChecklistPage from "./pages/AdminLaunchChecklistPage";
import AdminFlashLoanAnalyticsPage from "./pages/AdminFlashLoanAnalyticsPage";
import AdminNDASignaturesPage from "./pages/AdminNDASignaturesPage";
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
              <Route path="/reserves" element={<ProofOfReservePage />} />
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
              <Route path="/admin/token-operations" element={<AdminTokenOperationsPage />} />
              <Route path="/admin/attestations" element={<AdminAttestationsPage />} />
              <Route path="/admin/submissions" element={<AdminSubmissionsPage />} />
              <Route path="/admin/token-proposals" element={<AdminTokenProposalsPage />} />
              <Route path="/admin/fee-payers" element={<AdminFeePayersPage />} />
              <Route path="/admin/evm-fee-payers" element={<AdminEvmFeePayersPage />} />
              <Route path="/admin/arbitrage/strategies" element={<AdminArbitrageStrategiesPage />} />
              <Route path="/admin/arbitrage/runs" element={<AdminArbitrageRunsPage />} />
              <Route path="/admin/arbitrage/automation" element={<AdminAutomatedArbitragePage />} />
              <Route path="/admin/arbitrage/flash-loans" element={<AdminFlashLoanProvidersPage />} />
              <Route path="/admin/arbitrage/flash-loan-analytics" element={<AdminFlashLoanAnalyticsPage />} />
              <Route path="/admin/archived" element={<AdminArchivedPage />} />
              <Route path="/admin/news" element={<AdminNewsPage />} />
              <Route path="/admin/activity" element={<AdminActivityPage />} />
              <Route path="/admin/launch-checklist" element={<AdminLaunchChecklistPage />} />
              <Route path="/admin/nda-signatures" element={<AdminNDASignaturesPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WalletProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
