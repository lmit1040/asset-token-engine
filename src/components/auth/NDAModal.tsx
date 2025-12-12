import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Shield, Check, Loader2 } from 'lucide-react';

export const NDA_VERSION = '1.0';

export const NDA_CONTENT = `
METALLUMX PLATFORM NON-DISCLOSURE AGREEMENT

Version ${NDA_VERSION} - Effective Date: December 2024

This Non-Disclosure Agreement ("Agreement") is entered into by and between MetallumX ("Company") and the undersigned user ("User").

1. CONFIDENTIAL INFORMATION
The User acknowledges that through access to the MetallumX platform, they may receive or have access to confidential information including but not limited to:
- Proprietary tokenization technology and methodologies
- Asset reserve information and verification processes
- Platform architecture and security protocols
- Business strategies and operational data
- User data and transaction information

2. OBLIGATIONS OF THE USER
The User agrees to:
a) Maintain strict confidentiality of all proprietary information
b) Not disclose, publish, or disseminate confidential information to any third party
c) Not use confidential information for any purpose other than as authorized by the platform
d) Take reasonable precautions to protect the confidentiality of information
e) Immediately notify the Company of any unauthorized disclosure

3. EXCLUSIONS
This Agreement does not apply to information that:
a) Is publicly available at the time of disclosure
b) Becomes publicly available through no fault of the User
c) Is required to be disclosed by law or court order

4. TERM AND TERMINATION
This Agreement shall remain in effect for the duration of the User's account and for a period of two (2) years following account termination.

5. INTELLECTUAL PROPERTY
All intellectual property rights in the platform and its contents remain the exclusive property of MetallumX. The User acquires no rights to any intellectual property through use of the platform.

6. PLATFORM USAGE TERMS
The User acknowledges that:
a) MetallumX provides tokenization services for precious metals and collectibles
b) Tokens represent ownership claims to underlying physical assets
c) The platform does not provide investment advice or financial guarantees
d) Users are responsible for their own due diligence regarding asset purchases
e) The platform maintains proof-of-reserve documentation for transparency

7. LIMITATION OF LIABILITY
MetallumX shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of the platform or breach of this Agreement.

8. GOVERNING LAW
This Agreement shall be governed by applicable laws and regulations regarding digital asset platforms and confidentiality agreements.

9. ELECTRONIC SIGNATURE
By typing your full legal name below and clicking "I Agree," you acknowledge that:
a) This constitutes your electronic signature
b) Your signature will be recorded on the Solana blockchain for verification
c) You have read and understood all terms of this Agreement
d) You agree to be legally bound by this Agreement

10. BLOCKCHAIN VERIFICATION
Your signature will be cryptographically hashed and recorded on the Solana blockchain, providing an immutable record of your acceptance of this Agreement. This blockchain record serves as verification of the date, time, and authenticity of your signature.
`;

interface NDAModalProps {
  open: boolean;
  onAccept: (signatureName: string) => void;
  onCancel: () => void;
  userName: string;
  userEmail: string;
  isSubmitting?: boolean;
}

export function NDAModal({ 
  open, 
  onAccept, 
  onCancel, 
  userName, 
  userEmail,
  isSubmitting = false 
}: NDAModalProps) {
  const [signatureName, setSignatureName] = useState('');
  const [hasRead, setHasRead] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const isValid = hasRead && hasScrolledToBottom && signatureName.trim().length >= 2;

  const handleAccept = () => {
    if (isValid && !isSubmitting) {
      onAccept(signatureName.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Non-Disclosure Agreement
          </DialogTitle>
          <DialogDescription>
            Please read and sign the following agreement to create your account.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea 
          className="flex-1 max-h-[40vh] border rounded-md p-4 bg-muted/30"
          onScrollCapture={handleScroll}
        >
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
            {NDA_CONTENT}
          </pre>
        </ScrollArea>

        {!hasScrolledToBottom && (
          <p className="text-xs text-amber-500 text-center">
            Please scroll to the bottom of the agreement to continue
          </p>
        )}

        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Blockchain Verification</p>
              <p className="text-muted-foreground text-xs mt-1">
                Your signature will be recorded on the Solana blockchain for permanent verification.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-name" className="text-sm">
              Type your full legal name as your electronic signature
            </Label>
            <Input
              id="signature-name"
              placeholder="Enter your full legal name"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              className="font-medium"
              disabled={isSubmitting}
            />
            {userName && (
              <p className="text-xs text-muted-foreground">
                Account name: {userName} ({userEmail})
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox 
              id="confirm-read"
              checked={hasRead}
              onCheckedChange={(checked) => setHasRead(checked === true)}
              disabled={!hasScrolledToBottom || isSubmitting}
            />
            <Label 
              htmlFor="confirm-read" 
              className="text-sm cursor-pointer select-none"
            >
              I have read, understood, and agree to the terms of this Non-Disclosure Agreement
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!isValid || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recording on Blockchain...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  I Agree & Sign
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
