import { BarChart, Bar, LineChart, Line, XAxis, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { Milestone, Car, Gauge, Trophy } from 'lucide-react';
import { spd, speedUnit, distUnit, fmtBig } from '@/lib/units';

function StatCard({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="bg-card rounded-2xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold speed-font text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// One compact row of your totals.
export function StatsRow({ stats }) {
  const items = [
    [fmtBig(stats.lifetimeMiles).split(' ')[0], distUnit() === 'km' ? 'km' : 'miles', '#00BFFF'],
    [stats.totalDrives.toLocaleString(), 'drives', '#39FF14'],
    [spd(stats.avgSpeed), `avg ${speedUnit()}`, '#FF6B35'],
    [spd(stats.bestTopSpeed), `top ${speedUnit()}`, '#FF4757'],
  ];
  return (
    <div className="bg-card rounded-2xl border border-border grid grid-cols-4 divide-x divide-border">
      {items.map(([v, l, c]) => (
        <div key={l} className="py-3 text-center">
          <div className="text-base font-bold speed-font" style={{ color: c }}>{v}</div>
          <div className="text-[10px] text-muted-foreground">{l}</div>
        </div>
      ))}
    </div>
  );
}

export default function StatsDashboard({ stats, weekly = [], chartsOnly = false }) {
  const chartData = weekly.map((w) => ({ ...w, avgSpeed: spd(w.avgSpeed) }));
  return (
    <div className="space-y-4">
      {!chartsOnly && <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Milestone} label={distUnit() === 'km' ? 'Lifetime km' : 'Lifetime Miles'} value={fmtBig(stats.lifetimeMiles).split(' ')[0]} unit={distUnit()} color="#00BFFF" />
        <StatCard icon={Car} label="Total Drives" value={stats.totalDrives} color="#39FF14" />
        <StatCard icon={Gauge} label="Average Speed" value={spd(stats.avgSpeed)} unit={speedUnit()} color="#FF6B35" />
        <StatCard icon={Trophy} label="Best Top Speed" value={spd(stats.bestTopSpeed)} unit={speedUnit()} color="#FF4757" />
      </div>}

      <div className="bg-card rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">Drive Frequency</span>
          <span className="text-[10px] text-muted-foreground">Last 8 weeks</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="week" tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#141420', border: '1px solid #1f1f2e', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#8b8b9f' }}
              cursor={{ fill: 'rgba(0,191,255,0.05)' }}
            />
            <Bar dataKey="drives" fill="#00BFFF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">Speed Trend</span>
          <span className="text-[10px] text-muted-foreground">Avg {speedUnit()} per week</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <XAxis dataKey="week" tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#141420', border: '1px solid #1f1f2e', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#8b8b9f' }}
            />
            <Line type="monotone" dataKey="avgSpeed" stroke="#39FF14" strokeWidth={2} dot={{ fill: '#39FF14', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
