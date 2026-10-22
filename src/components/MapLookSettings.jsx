import { Check, BatteryLow, CloudSun, Languages } from 'lucide-react';
import { THEMES, useMapLook, isLite, featureName } from '@/lib/mapTheme';

const Toggle = ({ on }) => (
  <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#34A853]' : 'bg-muted'}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </span>
);

export function ThemePicker({ compact = false }) {
  const [look, update] = useMapLook();
  return (
    <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
      {THEMES.map((t) => {
        const on = look.theme === t.key;
        return (
          <button key={t.key} onClick={() => update({ theme: t.key })}
            className={`relative rounded-xl border p-2 text-left ${on ? 'border-primary bg-primary/10' : 'border-border bg-secondary/60'}`}>
            <div className="flex h-6 rounded-md overflow-hidden mb-1.5">{t.swatch.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
            <div className="text-xs font-semibold text-foreground leading-tight">{look.jpNames ? t.jp : t.label}</div>
            {!compact && <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t.text}</div>}
            {on && <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

// Profile → Map look: world theme, battery saver, weather effects, Japanese names.
export default function MapLookSettings() {
  const [look, update] = useMapLook();
  const lite = isLite(look);
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">Map look</h3>
        <p className="text-[11px] text-muted-foreground">Changes how the city looks on the drive map. Roads, your route and hazards stay easy to read.</p>
      </div>
      <ThemePicker />
      <div>
        <div className="flex items-center gap-2 mb-1.5"><BatteryLow className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold text-foreground">Battery saver / simple map</span></div>
        <div className="flex bg-secondary rounded-lg p-0.5">
          {[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([k, l]) => (
            <button key={k} onClick={() => update({ saver: k })} className={`flex-1 text-xs py-1.5 rounded-md ${look.saver === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{lite ? 'Simple map is on: no animations or 3D buildings.' : 'Full detail. Auto switches to simple on older phones.'}</p>
      </div>
      <button onClick={() => update({ weatherFx: !look.weatherFx })} className="w-full flex items-center gap-3 text-left">
        <CloudSun className="w-4 h-4 text-muted-foreground" />
        <div className="flex-1"><div className="text-sm font-semibold text-foreground">Live weather on the map</div><div className="text-[10px] text-muted-foreground">Rain, fog, snow and clouds where you are</div></div>
        <Toggle on={look.weatherFx} />
      </button>
      <button onClick={() => update({ jpNames: !look.jpNames })} className="w-full flex items-center gap-3 text-left">
        <Languages className="w-4 h-4 text-muted-foreground" />
        <div className="flex-1"><div className="text-sm font-semibold text-foreground">Japanese feature names</div><div className="text-[10px] text-muted-foreground">e.g. {featureName('map', true)}, {featureName('night', true)}, {featureName('twisty', true)}</div></div>
        <Toggle on={look.jpNames} />
      </button>
    </div>
  );
}
