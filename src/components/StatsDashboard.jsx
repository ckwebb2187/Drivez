import { BarChart, Bar, LineChart, Line, XAxis, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { Milestone, Car, Gauge, Trophy } from 'lucide-react';

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

export default function StatsDashboard({ stats, weekly = [] }) {
  const chartData = weekly;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Milestone} label="Lifetime Miles" value={stats.lifetimeMiles.toLocaleString()} unit="mi" color="#00BFFF" />
        <StatCard icon={Car} label="Total Drives" value={stats.totalDrives} color="#39FF14" />
        <StatCard icon={Gauge} label="Average Speed" value={stats.avgSpeed} unit="mph" color="#FF6B35" />
        <StatCard icon={Trophy} label="Best Top Speed" value={stats.bestTopSpeed} unit="mph" color="#FF4757" />
      </div>

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
          <span className="text-[10px] text-muted-foreground">Avg mph per week</span>
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
