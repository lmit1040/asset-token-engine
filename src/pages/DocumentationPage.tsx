import { useState } from 'react';
import { Download, FileText, ChevronRight, ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

const sections = [
  {
    id: 'overview',
    title: 'Overview',
    content: `MetallumX Vault is a comprehensive blockchain platform designed for tokenizing and managing precious metal assets. The platform bridges traditional precious metals (gold, silver, copper) with blockchain technology, enabling fractional ownership, transparent verification, and seamless trading.

Key Features:
• Asset Tokenization - Convert physical precious metals into blockchain tokens
• Proof of Reserve - Cryptographic verification of asset backing
• Multi-Chain Support - Solana, Polygon, Ethereum, Arbitrum, BSC
• Governance - Decentralized decision-making through MXG token
• Staking & Rewards - Earn passive income on your holdings`,
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: `1. Create Your Account
   - Visit the homepage and click "Sign Up"
   - Enter your email address and create a secure password
   - Verify your email through the confirmation link
   - Complete your profile to earn 50 MXG tokens

2. Connect Your Wallet
   - Navigate to your Profile page
   - Click "Connect Wallet" for Solana or EVM
   - Approve the connection in your wallet app
   - Your wallet address will be linked to your account

3. Explore the Dashboard
   - View your portfolio value and holdings
   - Monitor market trends with the crypto ticker
   - Access recent transactions and news`,
  },
  {
    id: 'assets',
    title: 'Managing Assets',
    content: `Viewing Assets
Navigate to the "Assets" page to browse all vault assets. Each asset displays:
• Asset type (Gold, Silver, Copper, Certificates)
• Quantity and unit of measurement
• Storage location
• Verification status
• Associated token information

Submitting New Assets
1. Go to "Submit Asset" in the navigation
2. Fill in asset details:
   - Title and description
   - Asset type selection
   - Estimated quantity and unit
   - Location description
   - Supporting documentation (images, certificates)
3. Submit for review
4. Earn 10 MXG tokens upon approval`,
  },
  {
    id: 'tokens',
    title: 'Token Operations',
    content: `Understanding Tokens
• 1:1 Tokens - Direct ownership of specific assets
• Fractional Tokens - Share of a diversified vault basket
• MXG - Governance token for platform participation
• MXU - Utility token for fee discounts

Viewing Your Holdings
Visit "Tokens" page to see:
• All available token definitions
• Your personal holdings and balances
• On-chain vs. off-chain balances
• Token deployment status

Transferring Tokens
1. Navigate to "Transfers" page
2. Click "Send Tokens"
3. Select token type and amount
4. Enter recipient wallet address or username
5. Add optional message
6. Confirm and submit transfer request`,
  },
  {
    id: 'governance',
    title: 'Governance & Voting',
    content: `MXG Token
MXG is the governance token that enables:
• Voting on platform proposals
• Creating new proposals (100 MXG minimum)
• Earning rewards for participation
• Staking for passive income

Voting Process
1. Go to "Governance" page
2. Browse active proposals
3. Click on a proposal to view details
4. Cast your vote: For, Against, or Abstain
5. Earn 5 MXG for each vote cast

Proposal Types
• Parameter Changes - Adjust platform settings
• Token Additions - Add new token types
• Fee Adjustments - Modify fee structures
• General - Other governance matters`,
  },
  {
    id: 'earning',
    title: 'Earning Rewards',
    content: `Staking
• Minimum stake: 10 MXG
• APY: 8% on default pool
• Lock period: 30 days
• Daily reward calculations
• Compound or withdraw after unlock

Activity Rewards
• Submit Asset: 10 MXG per approved submission
• Complete Profile: 50 MXG one-time bonus
• Vote on Proposal: 5 MXG per vote
• Refer New Users: 25 MXG signup + 100 MXG onboarding

Referral Program
1. Get your unique referral code from "Earn MXG" page
2. Share with friends and community
3. Earn 25 MXG when they sign up
4. Earn additional 100 MXG when they complete onboarding`,
  },
  {
    id: 'mxu-benefits',
    title: 'MXU Benefits',
    content: `Fee Discount Tiers
Holding MXU tokens provides fee discounts:

• Bronze (100 MXU) - 5% discount
• Silver (500 MXU) - 10% discount
• Gold (1,000 MXU) - 20% discount
• Platinum (5,000 MXU) - 30% discount
• Diamond (10,000 MXU) - 50% discount

Benefits
• Reduced transaction fees
• Priority support access
• Early access to new features
• Enhanced voting power`,
  },
  {
    id: 'security',
    title: 'Security',
    content: `Asset Security
• Physical assets stored in verified secure vaults
• Regular third-party audits
• Proof of reserve verification
• Cryptographic hashing of all records

Account Security
• Email verification required
• Secure password requirements
• Wallet signature verification
• NDA signature for sensitive access
• Row-level security on all data

Best Practices
• Use unique, strong passwords
• Enable wallet transaction confirmations
• Verify contract addresses before transactions
• Keep wallet seed phrases secure offline
• Review all transactions before signing`,
  },
  {
    id: 'support',
    title: 'Support & Contact',
    content: `Getting Help
• FAQ Page - Search common questions
• Onboarding Tour - Guided platform walkthrough
• Documentation - This comprehensive guide

Contact Us
• Email: support@metallumx.io
• Response time: Within 24 hours

Reporting Issues
When contacting support, include:
• Your account email
• Description of the issue
• Steps to reproduce (if applicable)
• Screenshots (if relevant)
• Transaction IDs (for transfer issues)`,
  },
];

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let yPosition = 20;

      // Title
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('MetallumX Vault', margin, yPosition);
      yPosition += 10;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('User Documentation', margin, yPosition);
      yPosition += 15;

      // Horizontal line
      doc.setDrawColor(200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 15;

      // Content
      sections.forEach((section) => {
        // Check if we need a new page
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 20;
        }

        // Section title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(section.title, margin, yPosition);
        yPosition += 8;

        // Section content
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const lines = doc.splitTextToSize(section.content, maxWidth);
        lines.forEach((line: string) => {
          if (yPosition > 280) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, margin, yPosition);
          yPosition += 5;
        });
        
        yPosition += 10;
      });

      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
          `MetallumX Vault Documentation - Page ${i} of ${pageCount}`,
          margin,
          doc.internal.pageSize.getHeight() - 10
        );
        doc.text(
          `Generated: ${new Date().toLocaleDateString()}`,
          pageWidth - margin - 50,
          doc.internal.pageSize.getHeight() - 10
        );
      }

      doc.save('MetallumX-Documentation.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentSection = sections.find(s => s.id === activeSection);

  return (
    <DashboardLayout
      title="Documentation"
      subtitle="Complete user guide for MetallumX Vault"
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="glass-card p-4 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Contents</h3>
              <Button
                size="sm"
                onClick={generatePDF}
                disabled={isGenerating}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'PDF'}
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <nav className="space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                      activeSection === section.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{section.title}</span>
                    {activeSection === section.id && (
                      <ChevronRight className="h-4 w-4 ml-auto" />
                    )}
                  </button>
                ))}
              </nav>
            </ScrollArea>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="glass-card p-8">
            {currentSection && (
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-6">
                  {currentSection.title}
                </h2>
                <div className="prose prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-muted-foreground bg-transparent p-0 text-sm leading-relaxed">
                    {currentSection.content}
                  </pre>
                </div>

                {/* Navigation buttons */}
                <div className="flex justify-between mt-8 pt-6 border-t border-border">
                  {sections.findIndex(s => s.id === activeSection) > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const currentIndex = sections.findIndex(s => s.id === activeSection);
                        setActiveSection(sections[currentIndex - 1].id);
                      }}
                    >
                      ← Previous
                    </Button>
                  ) : <div />}
                  
                  {sections.findIndex(s => s.id === activeSection) < sections.length - 1 && (
                    <Button
                      onClick={() => {
                        const currentIndex = sections.findIndex(s => s.id === activeSection);
                        setActiveSection(sections[currentIndex + 1].id);
                      }}
                    >
                      Next →
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
