import { useEffect, useState } from 'react';
import { Crown, Trophy, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { getInitials } from '@/lib/helpers';

const SCOPES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'friends', label: 'Friends' },
  { key: 'me', label: 'Mine' },
];

function Avatar({ entry, className, style }) {
  if (entry.avatarUrl) return <img src={entry.avatarUrl} alt="" className={`${className} object-cover`} style={style} />;
  return (
    <div className={`${className} flex items-center justify-center font-bold text-white`} style={{ backgroundColor: entry.color || '#00BFFF', ...style }}>
      {getInitials(entry.name)}
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useApp();
  const [scope, setScope] = useState('everyone');
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setEntries(null); setError('');
    api.get(`/leaderboard?scope=${scope}`)
      .then((d) => alive && setEntries(d.entries))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [scope]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ranked = (entries || []).map((e, i) => ({ ...e, rank: i + 1 }));
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="min-h-full">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Leaderboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Top speeds logged on Kaido Maps</p>
      </div>

      <div className="flex gap-2 px-5 mb-5">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${scope === s.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="px-5 text-xs text-destructive">{error}</p>}

      {entries === null && !error ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : ranked.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {scope === 'friends' ? 'No friends on the board yet — add friends from your Profile' : 'No drives yet — tap Drive to start your first one'}
          </p>
        </div>
      ) : (
        <>
          {/* Podium */}
          <div className="px-5 mb-6">
            <div className="flex items-end justify-center gap-3 mb-2">
              {podiumOrder.map((entry) => {
                const isFirst = entry.rank === 1;
                const isSecond = entry.rank === 2;
                return (
                  <div key={entry.rank} className="flex flex-col items-center" style={{ width: '30%' }}>
                    <div className={`relative ${isFirst ? 'mb-2' : 'mb-1'}`}>
                      {isFirst && (
                        <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 w-5 h-5 text-yellow-400" fill="currentColor" />
                      )}
                      <Avatar
                        entry={entry}
                        className={`rounded-full border-2 ${isFirst ? 'w-16 h-16 text-base border-yellow-400' : isSecond ? 'w-12 h-12 text-sm border-gray-400' : 'w-12 h-12 text-sm border-orange-600'}`}
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate w-full text-center">{entry.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">{entry.vehicle || entry.title}</span>
                    <div
                      className={`mt-2 w-full rounded-t-xl flex flex-col items-center justify-start pt-3 ${isFirst ? 'h-24 bg-gradient-to-b from-yellow-400/20' : isSecond ? 'h-16 bg-gradient-to-b from-gray-400/15' : 'h-12 bg-gradient-to-b from-orange-600/15'}`}
                    >
                      <span className={`text-lg font-bold speed-font ${isFirst ? 'text-yellow-400' : isSecond ? 'text-gray-300' : 'text-orange-400'}`}>
                        {entry.topSpeed}
                      </span>
                      <span className="text-[9px] text-muted-foreground">mph</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rest */}
          <div className="px-5 space-y-1.5 pb-4">
            {rest.map(entry => (
              <div key={entry.rank} className={`bg-card rounded-2xl p-3.5 border flex items-center gap-3 ${entry.userId === user.id ? 'border-primary/50' : 'border-border'}`}>
                <div className="w-7 text-center">
                  <span className="text-sm font-bold text-muted-foreground">{entry.rank}</span>
                </div>
                <Avatar entry={entry} className="w-10 h-10 rounded-full text-[10px]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{entry.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{entry.vehicle || entry.title}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-lg font-bold speed-font text-foreground">{entry.topSpeed}</span>
                    <span className="text-[10px] text-muted-foreground">mph</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
