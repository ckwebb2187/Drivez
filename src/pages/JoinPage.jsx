import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { getInitials } from '@/lib/helpers';

// Opened from someone's invite link: join (or log in) and you're friends automatically.
export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [who, setWho] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/invite/${code}`).then(setWho).catch((e) => setError(e.message)); }, [code]);
  useEffect(() => {
    if (isLoadingAuth || error) return;
    try { localStorage.setItem('dz-invite', code); } catch { /* private mode */ }
    if (user) navigate('/', { replace: true }); // the app accepts it right away (see Layout)
  }, [isLoadingAuth, user, error]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'radial-gradient(120% 80% at 50% 20%, #18235a, #03051a)' }}>
      <div className="w-full max-w-sm text-center">
        <img src="/icon-192.png" alt="" className="w-20 h-20 rounded-2xl mx-auto mb-6 shadow-2xl" />
        {error ? <p className="text-sm text-red-300">{error}</p> : !who ? <Loader2 className="w-6 h-6 animate-spin text-white/60 mx-auto" /> : (
          <>
            {who.avatarUrl
              ? <img src={who.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-white/30" />
              : <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-xl font-bold text-white" style={{ background: who.color || '#ff2d55' }}>{getInitials(who.name)}</div>}
            <h1 className="text-2xl font-black text-white mt-4">{who.name} invited you</h1>
            <p className="text-sm text-white/70 mt-1">Join Kaido Maps and you'll be friends automatically: see each other on the map, share drives and routes.</p>
            <div className="mt-6 space-y-2">
              <Link to="/register" className="block w-full rounded-xl py-3.5 text-sm font-bold text-white" style={{ background: 'linear-gradient(90deg,#ff2d55,#ff6a3d)' }}>Create my account</Link>
              <Link to="/login" className="block w-full rounded-xl py-3 text-sm font-semibold text-white bg-white/10">I already have one: log in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
