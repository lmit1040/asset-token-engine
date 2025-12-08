import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SubmissionForm } from '@/components/submissions/SubmissionForm';
import { useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';

export default function SubmitAssetPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout
      title="Submit Asset"
      subtitle="Submit a new asset for review and potential tokenization"
    >
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">New Asset Submission</h2>
              <p className="text-sm text-muted-foreground">
                Your submission will be reviewed by our team
              </p>
            </div>
          </div>

          <SubmissionForm onSuccess={() => navigate('/my-submissions')} />
        </div>
      </div>
    </DashboardLayout>
  );
}
