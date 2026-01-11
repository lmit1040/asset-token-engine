import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, X, FileVideo, FileAudio, FileText, Image as ImageIcon, Loader2, Link2, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContentUploaderProps {
  accept: string;
  folder: string;
  onUploadComplete: (url: string, metadata?: { duration?: number }) => void;
  currentUrl?: string | null;
  className?: string;
  allowExternalUrl?: boolean;
}

const BUCKET_NAME = 'training-content';

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType === 'application/pdf') return FileText;
  return FileText;
};

const isAwsUrl = (url: string): boolean => {
  return url.includes('.s3.') || url.includes('s3.amazonaws.com') || url.includes('amazonaws.com');
};

const isCloudStorageUrl = (url: string): boolean => {
  return isAwsUrl(url) || 
    url.includes('dropbox.com') || 
    url.includes('drive.google.com') || 
    url.includes('box.com');
};

const getCloudProvider = (url: string): string | null => {
  if (isAwsUrl(url)) return 'AWS S3';
  if (url.includes('dropbox.com')) return 'Dropbox';
  if (url.includes('drive.google.com')) return 'Google Drive';
  if (url.includes('box.com')) return 'Box';
  return null;
};

export function ContentUploader({ 
  accept, 
  folder, 
  onUploadComplete, 
  currentUrl,
  className,
  allowExternalUrl = true
}: ContentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [externalUrl, setExternalUrl] = useState('');
  const [activeTab, setActiveTab] = useState<string>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const acceptedTypes = accept.split(',').map(t => t.trim());
    const isValidType = acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const category = type.replace('/*', '');
        return file.type.startsWith(category);
      }
      return file.type === type || file.name.endsWith(type.replace('.', ''));
    });

    if (!isValidType) {
      toast.error('Invalid file type');
      return;
    }

    // Max 100MB
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File too large (max 100MB)');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Generate unique filename
      const ext = file.name.split('.').pop();
      const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      // Upload file
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;

      // Create preview for images
      if (file.type.startsWith('image/')) {
        setPreview(publicUrl);
      } else if (file.type.startsWith('video/')) {
        setPreview(publicUrl);
      } else {
        setPreview(null);
      }

      // Try to get duration for media files
      let metadata: { duration?: number } = {};
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        try {
          metadata.duration = await getMediaDuration(file);
        } catch {
          // Duration detection failed, continue without it
        }
      }

      onUploadComplete(publicUrl, metadata);
      toast.success('File uploaded');
      setProgress(100);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getMediaDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const element = file.type.startsWith('video/') 
        ? document.createElement('video')
        : document.createElement('audio');
      
      element.preload = 'metadata';
      element.onloadedmetadata = () => {
        URL.revokeObjectURL(element.src);
        resolve(Math.round(element.duration));
      };
      element.onerror = reject;
      element.src = URL.createObjectURL(file);
    });
  };

  const handleExternalUrl = () => {
    if (!externalUrl.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(externalUrl);
    } catch {
      toast.error('Invalid URL format');
      return;
    }

    const provider = getCloudProvider(externalUrl);
    
    setPreview(externalUrl);
    onUploadComplete(externalUrl);
    
    if (provider) {
      toast.success(`${provider} content linked successfully`);
    } else {
      toast.success('External URL added');
    }
    setExternalUrl('');
  };

  const handleRemove = () => {
    setPreview(null);
    setExternalUrl('');
    onUploadComplete('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isImage = accept.includes('image');
  const isVideo = accept.includes('video');
  const cloudProvider = preview ? getCloudProvider(preview) : null;

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Preview Section */}
      {preview && isImage && (
        <div className="relative inline-block">
          <img 
            src={preview} 
            alt="Preview" 
            className="h-24 w-auto rounded border object-cover"
          />
          {cloudProvider && (
            <span className="absolute bottom-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {cloudProvider}
            </span>
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-2 -top-2 h-6 w-6"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {preview && isVideo && (
        <div className="relative inline-block">
          <video 
            src={preview} 
            className="h-24 w-auto rounded border"
            controls={false}
          />
          {cloudProvider && (
            <span className="absolute bottom-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {cloudProvider}
            </span>
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-2 -top-2 h-6 w-6"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {preview && !isImage && !isVideo && (
        <div className="flex items-center gap-2 rounded border p-2">
          {cloudProvider ? (
            <Cloud className="h-5 w-5 text-primary" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm truncate block">
              {cloudProvider ? `${cloudProvider} content linked` : 'File uploaded'}
            </span>
            {preview && (
              <span className="text-xs text-muted-foreground truncate block">
                {preview.split('/').pop()?.substring(0, 40)}...
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Upload/URL Input Section */}
      {!preview && (
        <>
          {allowExternalUrl ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="text-xs">
                  <Upload className="mr-1 h-3 w-3" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="text-xs">
                  <Cloud className="mr-1 h-3 w-3" />
                  Cloud URL
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                    </>
                  )}
                </Button>
              </TabsContent>
              
              <TabsContent value="url" className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste AWS S3, Dropbox, Google Drive, or Box URL"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={handleExternalUrl}
                    size="sm"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports AWS S3, Dropbox, Google Drive, and Box URLs for streaming
                </p>
              </TabsContent>
            </Tabs>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </Button>
          )}
        </>
      )}

      {uploading && (
        <Progress value={progress} className="h-1" />
      )}

      {currentUrl && !preview && (
        <p className="text-xs text-muted-foreground truncate">
          Current: {currentUrl.split('/').pop()}
        </p>
      )}
    </div>
  );
}
