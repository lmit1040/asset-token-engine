import { useState } from 'react';
import { X, Upload, FileText, Video, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ProofUploadModalProps {
  assetId: string;
  assetName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function ProofUploadModal({ assetId, assetName, onClose, onSuccess }: ProofUploadModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('video/')) return <Video className="h-8 w-8 text-primary" />;
    if (fileType.startsWith('image/')) return <Image className="h-8 w-8 text-primary" />;
    return <FileText className="h-8 w-8 text-primary" />;
  };

  const getFileTypeLabel = (fileType: string) => {
    if (fileType.startsWith('video/')) return 'Video';
    if (fileType.startsWith('image/')) return 'Image';
    if (fileType === 'application/pdf') return 'PDF Document';
    return 'Document';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    if (!title.trim()) {
      toast.error('Please enter a title for the proof file');
      return;
    }

    setIsUploading(true);
    try {
      // Compute SHA-256 hash
      const fileHash = await computeSHA256(file);

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${assetId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('proof-of-reserve')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('proof-of-reserve')
        .getPublicUrl(fileName);

      // Save to database with title and description
      const { error: dbError } = await supabase
        .from('proof_of_reserve_files')
        .insert({
          asset_id: assetId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_hash: fileHash,
          uploaded_by: user.id,
          title: title.trim(),
          description: description.trim() || null,
        });

      if (dbError) throw dbError;

      toast.success('Proof file uploaded successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Upload Proof of Reserve</h2>
            {assetName && (
              <p className="text-sm text-muted-foreground mt-1">For: {assetName}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Title Field */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="proof-title">Title <span className="text-destructive">*</span></Label>
          <Input
            id="proof-title"
            placeholder="e.g., Certificate of Authenticity, Storage Receipt"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description Field */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="proof-description">Description</Label>
          <Textarea
            id="proof-description"
            placeholder="Add details about this proof document..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex items-center gap-3 justify-center">
              {getFileIcon(file.type)}
              <div className="text-left">
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {getFileTypeLabel(file.type)} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground mb-2">Drag and drop your file here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <input
                type="file"
                accept="image/*,.pdf,video/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Supported formats: Images (JPG, PNG), PDFs, and Videos (MP4, MOV, WebM). A SHA-256 hash will be computed and stored for verification.
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || !title.trim() || isUploading}>
            {isUploading ? (
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
