import { Instagram, Facebook, Youtube } from 'lucide-react';

// Social accounts a profile can link (kept small so map screens don't load the sharing screen).
export const SOCIAL_LINKS = {
  instagram: { label: 'Instagram', icon: Instagram, url: (h) => `https://instagram.com/${h}` },
  x: { label: 'X', icon: ({ className }) => <span className={`${className} font-black text-[14px] leading-none flex items-center justify-center`}>𝕏</span>, url: (h) => `https://x.com/${h}` },
  facebook: { label: 'Facebook', icon: Facebook, url: (h) => `https://facebook.com/${h}` },
  tiktok: { label: 'TikTok', icon: ({ className }) => <span className={`${className} font-black text-[13px] leading-none flex items-center justify-center`}>♪</span>, url: (h) => `https://tiktok.com/@${h}` },
  youtube: { label: 'YouTube', icon: Youtube, url: (h) => `https://youtube.com/@${h}` },
};
