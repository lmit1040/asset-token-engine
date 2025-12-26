import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ShieldAlert, Zap } from 'lucide-react';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmPhrase: string;
  variant: 'danger' | 'warning' | 'critical';
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  variant,
  onConfirm,
  isLoading = false,
}: ConfirmationDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const isValid = inputValue === confirmPhrase;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm();
      setInputValue('');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInputValue('');
    }
    onOpenChange(newOpen);
  };

  const iconMap = {
    danger: <ShieldAlert className="h-6 w-6 text-destructive" />,
    warning: <AlertTriangle className="h-6 w-6 text-amber-500" />,
    critical: <Zap className="h-6 w-6 text-destructive" />,
  };

  const bgColorMap = {
    danger: 'bg-destructive/10 border-destructive/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    critical: 'bg-destructive/10 border-destructive/20',
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgColorMap[variant]} mb-2`}>
            {iconMap[variant]}
            <AlertDialogTitle className="text-lg m-0">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <Label htmlFor="confirm-input" className="text-sm font-medium">
            Type <span className="font-mono text-primary bg-muted px-1.5 py-0.5 rounded">{confirmPhrase}</span> to confirm
          </Label>
          <Input
            id="confirm-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type confirmation phrase..."
            className="mt-2"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
            className={variant === 'danger' || variant === 'critical' 
              ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' 
              : 'bg-amber-500 hover:bg-amber-600 text-white'}
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
