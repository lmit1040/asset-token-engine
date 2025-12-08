import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ASSET_TYPE_LABELS, AssetType } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Upload, X, FileText, Image as ImageIcon } from 'lucide-react';

interface UploadedFile {
  name: string;
  url: string;
  type: string;
}

interface SubmissionFormProps {
  onSuccess?: () => void;
}

export function SubmissionForm({ onSuccess }: SubmissionFormProps) {
  const { user, role } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    asset_type: '' as AssetType | '',
    title: '',
    description: '',
    estimated_quantity: '',
    unit: '',
    location_description: '',
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    const newFiles: UploadedFile[] = [];

    try {
      for (const file of Array.from(files)) {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large. Max 10MB allowed.`);
          continue;
        }

        // Generate unique file path
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('proof-of-reserve')
          .upload(`submissions/${fileName}`, file);

        if (error) {
          toast.error(`Failed to upload ${file.name}`);
          console.error('Upload error:', error);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('proof-of-reserve')
          .getPublicUrl(`submissions/${fileName}`);

        newFiles.push({
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
        });
      }

      if (newFiles.length > 0) {
        setUploadedFiles((prev) => [...prev, ...newFiles]);
        toast.success(`${newFiles.length} file(s) uploaded successfully`);
      }
    } catch (error: any) {
      toast.error('File upload failed');
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !formData.asset_type || !formData.title) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_asset_submissions')
        .insert([{
          user_id: user.id,
          submitted_by_role: role || 'standard_user',
          asset_type: formData.asset_type,
          title: formData.title,
          description: formData.description || null,
          estimated_quantity: formData.estimated_quantity ? parseFloat(formData.estimated_quantity) : null,
          unit: formData.unit || null,
          location_description: formData.location_description || null,
          documents: uploadedFiles.length > 0 ? JSON.parse(JSON.stringify(uploadedFiles)) : null,
        }]);

      if (error) throw error;

      toast.success('Asset submission created successfully');
      setFormData({
        asset_type: '',
        title: '',
        description: '',
        estimated_quantity: '',
        unit: '',
        location_description: '',
      });
      setUploadedFiles([]);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="asset_type">Asset Type *</Label>
          <Select
            value={formData.asset_type}
            onValueChange={(value) => setFormData({ ...formData, asset_type: value as AssetType })}
          >
            <SelectTrigger className="input-dark">
              <SelectValue placeholder="Select asset type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., 100 oz Silver Bar"
            className="input-dark"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the asset in detail..."
          className="input-dark min-h-[100px]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="estimated_quantity">Estimated Quantity</Label>
          <Input
            id="estimated_quantity"
            type="number"
            step="any"
            value={formData.estimated_quantity}
            onChange={(e) => setFormData({ ...formData, estimated_quantity: e.target.value })}
            placeholder="e.g., 100"
            className="input-dark"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            placeholder="e.g., oz, lb, piece"
            className="input-dark"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location_description">Storage Location</Label>
        <Input
          id="location_description"
          value={formData.location_description}
          onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
          placeholder="Where is the asset stored?"
          className="input-dark"
        />
      </div>

      {/* Document Upload Section */}
      <div className="space-y-3">
        <Label>Proof Documents</Label>
        <p className="text-sm text-muted-foreground">
          Upload photos, certificates, or other proof of asset ownership (max 10MB per file)
        </p>
        
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isUploading ? 'Uploading...' : 'Upload Files'}
          </Button>
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2 bg-muted/50 rounded-md p-3">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{file.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="h-6 w-6 p-0 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || isUploading}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit Asset for Review
      </Button>
    </form>
  );
}
