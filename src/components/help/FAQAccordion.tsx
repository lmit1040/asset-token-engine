import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  // Getting Started
  {
    id: 'gs-1',
    category: 'Getting Started',
    question: 'What is MetallumX Vault?',
    answer: 'MetallumX Vault is a blockchain platform that enables tokenization of precious metal assets like gold, silver, and copper. Users can submit physical assets for verification, receive tokenized representations, and trade them on-chain.',
  },
  {
    id: 'gs-2',
    category: 'Getting Started',
    question: 'How do I create an account?',
    answer: 'Click the "Sign Up" button on the homepage, enter your email and create a password. After email verification, you can access the dashboard and start exploring the platform.',
  },
  {
    id: 'gs-3',
    category: 'Getting Started',
    question: 'What wallets are supported?',
    answer: 'MetallumX supports both Solana wallets (Phantom, Solflare) and EVM-compatible wallets (MetaMask, WalletConnect). Connect your wallet from the Profile page to receive tokens on-chain.',
  },
  // Assets & Tokens
  {
    id: 'at-1',
    category: 'Assets & Tokens',
    question: 'How do I submit an asset for tokenization?',
    answer: 'Navigate to "Submit Asset" in the sidebar. Fill out the form with asset details including type (gold, silver, copper), quantity, and location. Upload supporting documentation. You\'ll earn 10 MXG tokens when your submission is approved.',
  },
  {
    id: 'at-2',
    category: 'Assets & Tokens',
    question: 'What is the difference between 1:1 and fractional tokens?',
    answer: '1:1 tokens represent ownership of a specific physical asset. Fractional tokens represent a share of a larger vault basket, allowing smaller investments in diversified precious metal holdings.',
  },
  {
    id: 'at-3',
    category: 'Assets & Tokens',
    question: 'How are assets verified?',
    answer: 'Submitted assets go through a multi-step verification process including documentation review, attestation by authorized verifiers, and proof-of-reserve hashing. All verifications are recorded on-chain.',
  },
  {
    id: 'at-4',
    category: 'Assets & Tokens',
    question: 'Can I transfer my tokens to another user?',
    answer: 'Yes! Go to the "Transfers" page to send tokens to other users. You can transfer via their wallet address or user account. All transfers require approval and are logged for transparency.',
  },
  // MXG Token & Governance
  {
    id: 'gov-1',
    category: 'Governance & MXG',
    question: 'What is the MXG token?',
    answer: 'MXG is the governance token of MetallumX. Holders can vote on proposals, stake for rewards, and receive fee discounts. MXG can be earned through platform activities, staking, and referrals.',
  },
  {
    id: 'gov-2',
    category: 'Governance & MXG',
    question: 'How do I earn MXG tokens?',
    answer: 'Earn MXG through: submitting assets (10 MXG), completing your profile (50 MXG), voting on proposals (5 MXG each), staking (8% APY), and referring new users (25-100 MXG per referral).',
  },
  {
    id: 'gov-3',
    category: 'Governance & MXG',
    question: 'How do I vote on governance proposals?',
    answer: 'Visit the "Governance" page to see active proposals. Click on a proposal to view details and cast your vote (For, Against, or Abstain). You need MXG tokens to participate in voting.',
  },
  {
    id: 'gov-4',
    category: 'Governance & MXG',
    question: 'What is the minimum to create a proposal?',
    answer: 'You need at least 100 MXG tokens to create a governance proposal. Proposals require a quorum and pass threshold to be implemented.',
  },
  // Staking & Rewards
  {
    id: 'sr-1',
    category: 'Staking & Rewards',
    question: 'How does staking work?',
    answer: 'Stake your tokens in available pools to earn rewards. The default pool offers 8% APY with a minimum stake of 10 MXG and a 30-day lock period. Rewards are calculated daily.',
  },
  {
    id: 'sr-2',
    category: 'Staking & Rewards',
    question: 'When can I withdraw my staked tokens?',
    answer: 'Staked tokens are locked for the pool\'s lock period (typically 30 days). After the lock period ends, you can withdraw your principal plus earned rewards.',
  },
  {
    id: 'sr-3',
    category: 'Staking & Rewards',
    question: 'How does the referral program work?',
    answer: 'Share your unique referral code with friends. When they sign up using your code, you earn 25 MXG. When they complete onboarding activities, you earn an additional 100 MXG.',
  },
  // MXU Benefits
  {
    id: 'mxu-1',
    category: 'MXU Benefits',
    question: 'What is MXU?',
    answer: 'MXU is the utility token that provides fee discounts on the platform. The more MXU you hold, the higher your fee discount tier.',
  },
  {
    id: 'mxu-2',
    category: 'MXU Benefits',
    question: 'What fee discounts are available?',
    answer: 'Fee discount tiers: Bronze (100 MXU) - 5% off, Silver (500 MXU) - 10% off, Gold (1000 MXU) - 20% off, Platinum (5000 MXU) - 30% off, Diamond (10000 MXU) - 50% off.',
  },
  // Security
  {
    id: 'sec-1',
    category: 'Security',
    question: 'How are my assets secured?',
    answer: 'Physical assets are stored in verified secure vaults. Digital tokens use blockchain security with RLS policies. All transactions require authentication and multi-step verification.',
  },
  {
    id: 'sec-2',
    category: 'Security',
    question: 'What is the NDA requirement?',
    answer: 'Users must sign a Non-Disclosure Agreement before accessing certain features. This protects proprietary information and ensures compliance with regulatory requirements.',
  },
  {
    id: 'sec-3',
    category: 'Security',
    question: 'How do I verify proof of reserves?',
    answer: 'Visit the "Proof of Reserve" page to see verified assets and their cryptographic hashes. You can independently verify that tokens are backed by real assets.',
  },
];

export function FAQAccordion() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(faqData.map(faq => faq.category))];

  const filteredFAQs = faqData.filter(faq => {
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedFAQs = filteredFAQs.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQItem[]>);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search FAQs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 input-dark"
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !selectedCategory 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === category 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* FAQ Accordions by category */}
      {Object.entries(groupedFAQs).length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No FAQs match your search. Try different keywords.
        </div>
      ) : (
        Object.entries(groupedFAQs).map(([category, faqs]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{category}</h3>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map(faq => (
                <AccordionItem 
                  key={faq.id} 
                  value={faq.id}
                  className="glass-card border-none px-4"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))
      )}
    </div>
  );
}
