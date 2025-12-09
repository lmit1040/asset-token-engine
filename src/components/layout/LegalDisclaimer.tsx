import { AlertTriangle } from 'lucide-react';

export function LegalDisclaimer() {
  return (
    <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="font-medium text-foreground">Important Disclosures</p>
          <ul className="space-y-1 text-xs">
            <li>• MetallumX Vault is a tokenization platform for asset-backed tokens only.</li>
            <li>• Tokens represent ownership claims to physical assets held in custody.</li>
            <li>• This platform does not offer financial advice, investment returns, or yield.</li>
            <li>• MXU fee discounts are utility benefits, not financial rewards.</li>
            <li>• No trading, exchange, or conversion to fiat currency is provided.</li>
            <li>• Users are responsible for their own tax and legal compliance.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function FooterLegalText() {
  return (
    <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
      MetallumX Vault provides asset tokenization services only. Tokens are not securities and do not represent 
      investment contracts. No financial yield, trading, or exchange services are offered. 
      Users bear all responsibility for legal and tax compliance in their jurisdiction.
    </p>
  );
}
