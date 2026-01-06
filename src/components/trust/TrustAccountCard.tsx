import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Calendar, MapPin, MoreVertical, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

interface TrustAccount {
  id: string;
  legal_name: string;
  entity_type: string;
  ein_last_four: string | null;
  formation_state: string | null;
  formation_date: string | null;
  is_active: boolean;
  annual_renewal_date: string | null;
  created_at: string;
}

interface TrustAccountCardProps {
  account: TrustAccount;
  onUpdate: () => void;
}

export function TrustAccountCard({ account, onUpdate }: TrustAccountCardProps) {
  const isRenewalSoon = () => {
    if (!account.annual_renewal_date) return false;
    const renewalDate = new Date(account.annual_renewal_date);
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilRenewal <= 30 && daysUntilRenewal >= 0;
  };

  const getEntityTypeColor = (type: string) => {
    switch (type) {
      case 'Trust': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'LLC': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'SPV': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Family Office': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="glass-card hover:border-primary/30 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{account.legal_name}</h3>
                <Badge variant="outline" className={getEntityTypeColor(account.entity_type)}>
                  {account.entity_type}
                </Badge>
                {!account.is_active && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                    Inactive
                  </Badge>
                )}
                {isRenewalSoon() && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                    Renewal Soon
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {account.ein_last_four && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    EIN: ***-**-{account.ein_last_four}
                  </span>
                )}
                {account.formation_state && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {account.formation_state}
                  </span>
                )}
                {account.formation_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Formed {format(new Date(account.formation_date), 'MMM yyyy')}
                  </span>
                )}
              </div>

              {account.annual_renewal_date && (
                <p className={`text-sm ${isRenewalSoon() ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  Annual renewal: {format(new Date(account.annual_renewal_date), 'MMMM d, yyyy')}
                </p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View Details</DropdownMenuItem>
              <DropdownMenuItem>View Invoices</DropdownMenuItem>
              <DropdownMenuItem>Manage Assets</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
