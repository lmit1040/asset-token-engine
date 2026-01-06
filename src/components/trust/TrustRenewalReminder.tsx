import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface TrustAccount {
  id: string;
  legal_name: string;
  annual_renewal_date: string | null;
}

interface TrustRenewalReminderProps {
  accounts: TrustAccount[];
}

export function TrustRenewalReminder({ accounts }: TrustRenewalReminderProps) {
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (!a.annual_renewal_date || !b.annual_renewal_date) return 0;
    return new Date(a.annual_renewal_date).getTime() - new Date(b.annual_renewal_date).getTime();
  });

  return (
    <Alert className="border-amber-500/30 bg-amber-500/5">
      <CalendarClock className="h-5 w-5 text-amber-400" />
      <AlertTitle className="text-amber-400">Upcoming Renewals</AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          {sortedAccounts.map((account) => {
            const daysUntil = account.annual_renewal_date
              ? differenceInDays(new Date(account.annual_renewal_date), new Date())
              : 0;
            
            return (
              <div key={account.id} className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">{account.legal_name}</span>
                  <span className="text-muted-foreground ml-2">
                    {account.annual_renewal_date && (
                      <>
                        due {format(new Date(account.annual_renewal_date), 'MMM d, yyyy')}
                        <span className={`ml-2 ${daysUntil <= 14 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          ({daysUntil} days)
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300">
                  Renew Now
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            );
          })}
        </div>
      </AlertDescription>
    </Alert>
  );
}
