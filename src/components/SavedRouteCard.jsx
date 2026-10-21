import { useNavigate } from 'react-router-dom';
import { Play, Share2, Trash2, Users, Route as RouteIcon } from 'lucide-react';
import RouteThumbnail from './RouteThumbnail';
import { useApp } from '@/lib/AppContext';

export default function SavedRouteCard({ route, onShare, onDelete }) {
  const navigate = useNavigate();
  const { user } = useApp();

  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border">
      <div className="relative h-28 bg-secondary">
        <RouteThumbnail route={route.route} className="w-full h-full" color="#00BFFF" />
        {route.sharedWith?.length > 0 && (
          <div className="absolute top-2 right-2 glass px-2 py-0.5 rounded-full flex items-center gap-1">
            <Users className="w-3 h-3 text-accent" />
            <span className="text-[10px] text-foreground font-medium">{route.sharedWith.length}</span>
          </div>
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-foreground">{route.name}</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RouteIcon className="w-3 h-3" />
            <span className="speed-font">{route.distance}</span>
            <span>mi</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/drive?route=${route.id}`)}
            className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1"
          >
            <Play className="w-3 h-3 fill-primary-foreground" /> Drive
          </button>
          <button
            onClick={() => onShare(route)}
            className="bg-secondary text-foreground rounded-xl py-2 px-3 text-xs font-medium flex items-center gap-1"
          >
            <Share2 className="w-3 h-3" /> Share
          </button>
          {route.created_by_id === (user && user.id) && (
            <button
              onClick={() => onDelete(route.id)}
              className="bg-secondary text-muted-foreground rounded-xl py-2 px-3"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
