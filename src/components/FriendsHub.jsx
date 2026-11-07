import { lazy, Suspense, useState } from 'react';
import { Users } from 'lucide-react';

// The sheet (friends list, group drive, chat, push-to-talk) loads on first tap.
const FriendsHubPanel = lazy(() => import('@/components/FriendsHubPanel'));

// Friends & group drives, reachable from the map (also mid-drive):
// who's driving now, invite friends to your group drive, join one, and the group chat.
export default function FriendsHub(props) {
  const { live = [], convoy, openConvoys = [], className = '' } = props;
  const [open, setOpen] = useState(false);
  const invites = openConvoys.filter((c) => c.invited);
  const badge = (convoy ? convoy.members.length : 0) || invites.length || live.length;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Friends and group drives"
        className={`relative dz-glow h-9 pl-2.5 pr-3 rounded-full shadow-xl border flex items-center gap-1 text-[11px] font-bold pointer-events-auto ${convoy || invites.length ? 'bg-primary text-primary-foreground border-primary' : 'dz-wire border-primary/60 text-white'} ${className}`}>
        <span className={`dz-sweep ${convoy || invites.length ? 'dz-sweep-light' : ''}`} aria-hidden="true" />
        <Users className="w-3.5 h-3.5" />{convoy ? 'Group' : 'Friends'}{badge ? <span className="opacity-80">· {badge}</span> : null}
        {invites.length > 0 && !convoy && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ff3b30] border-2 border-background" />}
      </button>

      {open && <Suspense fallback={null}><FriendsHubPanel {...props} onClose={() => setOpen(false)} /></Suspense>}
    </>
  );
}
