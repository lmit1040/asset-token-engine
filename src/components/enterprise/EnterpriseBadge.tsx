import { Badge } from '@/components/ui/badge';
import { FileCheck } from 'lucide-react';

interface EnterpriseBadgeProps {
  className?: string;
}

export function EnterpriseBadge({ className = '' }: EnterpriseBadgeProps) {
  return (
    <Badge 
      className={`bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border-purple-500/30 ${className}`}
    >
      <FileCheck className="h-3 w-3 mr-1" />
      Under Contract
    </Badge>
  );
}
