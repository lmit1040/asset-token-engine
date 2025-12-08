import { useState, useEffect } from 'react';
import { X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface CreateAttestationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Asset {
  id: string;
  name: string;
}

interface ProofFile {
  id: string;
  file_name: string;
  file_hash: string;
}

export function CreateAttestationModal({ onClose, onSuccess }: CreateAttestationModalProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [proofFiles, setProofFiles] = useState<ProofFile[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchAssets() {
      const { data } = await supabase
        .from('assets')
        .select('id, name')
        .order('name');
      setAssets(data || []);
    }
    fetchAssets();
  }, []);

  useEffect(() => {
    async function fetchProofFiles() {
      if (!selectedAsset) {
        setProofFiles([]);
        return;
      }
      const { data } = await supabase
        .from('proof_of_reserve_files')
        .select('id, file_name, file_hash')
        .eq('asset_id', selectedAsset)
        .order('uploaded_at', { ascending: false });
      setProofFiles(data || []);
    }
    fetchProofFiles();
  }, [selectedAsset]);

  const handleSubmit = async () => {
    if (!selectedAsset) {
      toast({ title: 'Error', description: 'Please select an asset', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate a combined verification hash from selected files
      const selectedProofFiles = proofFiles.filter(f => selectedFiles.includes(f.id));
      const combinedHashes = selectedProofFiles.map(f => f.file_hash).join('');
      
      // Create a simple hash of the combined hashes (for demo - in production use crypto)
      const verificationHash = combinedHashes 
        ? btoa(combinedHashes).substring(0, 64) 
        : null;

      const { error } = await supabase
        .from('attestations')
        .insert({
          asset_id: selectedAsset,
          notes: notes.trim() || null,
          verification_hash: verificationHash,
          proof_file_ids: selectedFiles,
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Attestation created' });
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create attestation',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFile = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">New Attestation</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Asset Selection */}
          <div className="space-y-2">
            <Label>Asset</Label>
            <Select value={selectedAsset} onValueChange={setSelectedAsset}>
              <SelectTrigger>
                <SelectValue placeholder="Select an asset to attest" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Proof Files Selection */}
          {selectedAsset && (
            <div className="space-y-2">
              <Label>Proof Files to Include</Label>
              {proofFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No proof files uploaded for this asset yet.
                </p>
              ) : (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {proofFiles.map((file) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => toggleFile(file.id)}
                        className="rounded border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {file.file_name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {file.file_hash.slice(0, 16)}...
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Add any verification notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selectedAsset || isSubmitting}>
            {isSubmitting ? (
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Create Attestation
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
