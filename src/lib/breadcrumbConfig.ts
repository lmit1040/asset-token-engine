export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbConfig = {
  pattern: RegExp;
  breadcrumbs: BreadcrumbItem[];
}[];

// Order matters - more specific patterns should come first
const breadcrumbConfig: BreadcrumbConfig = [
  // Admin - Arbitrage sub-pages
  { pattern: /^\/admin\/arbitrage\/flash-loan-analytics$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'Flash Loan Analytics' },
  ]},
  { pattern: /^\/admin\/arbitrage\/flash-loans$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'Flash Loan Providers' },
  ]},
  { pattern: /^\/admin\/arbitrage\/new-pools$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'New Pool Detection' },
  ]},
  { pattern: /^\/admin\/arbitrage\/ops-events$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'OPS Events' },
  ]},
  { pattern: /^\/admin\/arbitrage\/profit-discovery$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'Profit Discovery' },
  ]},
  { pattern: /^\/admin\/arbitrage\/automation$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'Automation' },
  ]},
  { pattern: /^\/admin\/arbitrage\/strategies$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage Strategies' },
  ]},
  { pattern: /^\/admin\/arbitrage\/runs$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Arbitrage', href: '/admin/arbitrage/strategies' },
    { label: 'Runs' },
  ]},
  
  // Admin pages
  { pattern: /^\/admin\/users$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Users' },
  ]},
  { pattern: /^\/admin\/submissions$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Review Submissions' },
  ]},
  { pattern: /^\/admin\/token-proposals$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Token Proposals' },
  ]},
  { pattern: /^\/admin\/token-operations$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Token Operations' },
  ]},
  { pattern: /^\/admin\/attestations$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Attestations' },
  ]},
  { pattern: /^\/admin\/fee-payers$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fee Payers (SOL)' },
  ]},
  { pattern: /^\/admin\/evm-fee-payers$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fee Payers (EVM)' },
  ]},
  { pattern: /^\/admin\/news$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'News' },
  ]},
  { pattern: /^\/admin\/archived$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Archived' },
  ]},
  { pattern: /^\/admin\/activity$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Activity' },
  ]},
  { pattern: /^\/admin\/nda-signatures$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'NDA Signatures' },
  ]},
  { pattern: /^\/admin\/reward-config$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Reward Config' },
  ]},
  { pattern: /^\/admin\/referrals$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Referrals' },
  ]},
  { pattern: /^\/admin\/training$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Training Content' },
  ]},
  { pattern: /^\/admin\/launch-checklist$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Launch Checklist' },
  ]},
  { pattern: /^\/admin\/fees$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fee Management' },
  ]},
  { pattern: /^\/admin\/enterprise$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Enterprise Console' },
  ]},
  
  // Training course detail
  { pattern: /^\/training\/[^/]+$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Training', href: '/training' },
    { label: 'Course Details' },
  ]},
  
  // Governance proposal detail
  { pattern: /^\/governance\/[^/]+$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Governance', href: '/governance' },
    { label: 'Proposal Details' },
  ]},
  
  // Asset detail and edit
  { pattern: /^\/assets\/[^/]+\/edit$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Assets', href: '/assets' },
    { label: 'Edit Asset' },
  ]},
  { pattern: /^\/assets\/new$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Assets', href: '/assets' },
    { label: 'New Asset' },
  ]},
  { pattern: /^\/assets\/[^/]+$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Assets', href: '/assets' },
    { label: 'Asset Details' },
  ]},
  
  // Main pages
  { pattern: /^\/dashboard$/, breadcrumbs: [
    { label: 'Dashboard' },
  ]},
  { pattern: /^\/assets$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Assets' },
  ]},
  { pattern: /^\/tokens$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Tokens' },
  ]},
  { pattern: /^\/transfers$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Transfers' },
  ]},
  { pattern: /^\/submit-asset$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Submit Asset' },
  ]},
  { pattern: /^\/my-submissions$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Submissions' },
  ]},
  { pattern: /^\/mxu-benefits$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'MXU Benefits' },
  ]},
  { pattern: /^\/earn-mxg$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Earn MXG' },
  ]},
  { pattern: /^\/training$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Training' },
  ]},
  { pattern: /^\/governance$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Governance' },
  ]},
  { pattern: /^\/profile$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Profile' },
  ]},
  { pattern: /^\/faq$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'FAQ & Help' },
  ]},
  { pattern: /^\/help\/documentation$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Documentation' },
  ]},
  { pattern: /^\/reserves$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Proof of Reserve' },
  ]},
  { pattern: /^\/trust-dashboard$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Trust Dashboard' },
  ]},
  { pattern: /^\/fees$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fee Schedule' },
  ]},
  { pattern: /^\/pricing$/, breadcrumbs: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Pricing' },
  ]},
];

export function getBreadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  for (const config of breadcrumbConfig) {
    if (config.pattern.test(pathname)) {
      return config.breadcrumbs;
    }
  }
  
  // Default fallback
  return [{ label: 'Dashboard', href: '/dashboard' }];
}
