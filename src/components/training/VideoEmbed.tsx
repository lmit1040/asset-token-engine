import { useState } from 'react';
import { Play } from 'lucide-react';

interface VideoEmbedProps {
  url: string;
  title?: string;
  className?: string;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}

type VideoProvider = 'youtube' | 'vimeo' | 'tiktok' | 'instagram' | 'twitter' | 'aws' | 'direct';

interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  embedUrl: string;
}

function parseVideoUrl(url: string): ParsedVideo | null {
  if (!url) return null;

  // YouTube
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return {
      provider: 'youtube',
      videoId: youtubeMatch[1],
      embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=0&rel=0&enablejsapi=1`
    };
  }

  // Vimeo
  const vimeoRegex = /(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
  const vimeoMatch = url.match(vimeoRegex);
  if (vimeoMatch) {
    return {
      provider: 'vimeo',
      videoId: vimeoMatch[1],
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0`
    };
  }

  // TikTok
  const tiktokRegex = /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/)(\d+)/;
  const tiktokMatch = url.match(tiktokRegex);
  if (tiktokMatch) {
    return {
      provider: 'tiktok',
      videoId: tiktokMatch[1],
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`
    };
  }

  // Instagram
  const instagramRegex = /(?:instagram\.com\/(?:p|reel|tv)\/)([\w-]+)/;
  const instagramMatch = url.match(instagramRegex);
  if (instagramMatch) {
    return {
      provider: 'instagram',
      videoId: instagramMatch[1],
      embedUrl: `https://www.instagram.com/p/${instagramMatch[1]}/embed`
    };
  }

  // Twitter/X
  const twitterRegex = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
  const twitterMatch = url.match(twitterRegex);
  if (twitterMatch) {
    return {
      provider: 'twitter',
      videoId: twitterMatch[1],
      embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${twitterMatch[1]}`
    };
  }

  // AWS S3 / CloudFront (common patterns)
  const awsRegex = /(?:s3[.-][\w-]+\.amazonaws\.com|[\w-]+\.s3\.[\w-]+\.amazonaws\.com|[\w-]+\.cloudfront\.net)/;
  if (awsRegex.test(url)) {
    return {
      provider: 'aws',
      videoId: url,
      embedUrl: url
    };
  }

  // Direct video file
  const videoExtensions = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;
  if (videoExtensions.test(url)) {
    return {
      provider: 'direct',
      videoId: url,
      embedUrl: url
    };
  }

  // Fallback - try as direct video
  return {
    provider: 'direct',
    videoId: url,
    embedUrl: url
  };
}

export function VideoEmbed({ url, title = 'Video', className = '', onEnded, onTimeUpdate }: VideoEmbedProps) {
  const [error, setError] = useState(false);
  const parsedVideo = parseVideoUrl(url);

  if (!parsedVideo || error) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg aspect-video ${className}`}>
        <div className="text-center p-4">
          <Play className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {error ? 'Unable to load video' : 'No video available'}
          </p>
          {url && (
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline mt-2 block"
            >
              Open video in new tab
            </a>
          )}
        </div>
      </div>
    );
  }

  // Direct video or AWS - use native video player
  if (parsedVideo.provider === 'direct' || parsedVideo.provider === 'aws') {
    return (
      <video
        src={parsedVideo.embedUrl}
        className={`w-full h-full rounded-lg ${className}`}
        controls
        onEnded={onEnded}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onError={() => setError(true)}
        title={title}
      >
        Your browser does not support the video tag.
      </video>
    );
  }

  // Embedded players for social platforms
  const aspectRatio = parsedVideo.provider === 'tiktok' ? 'aspect-[9/16]' : 'aspect-video';
  const maxHeight = parsedVideo.provider === 'tiktok' ? 'max-h-[600px]' : '';

  return (
    <div className={`relative w-full ${aspectRatio} ${maxHeight} ${className}`}>
      <iframe
        src={parsedVideo.embedUrl}
        className="absolute inset-0 w-full h-full rounded-lg"
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onError={() => setError(true)}
      />
    </div>
  );
}

export { parseVideoUrl, type VideoProvider, type ParsedVideo };
