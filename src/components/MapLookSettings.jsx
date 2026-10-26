import { Check, BatteryLow, CloudSun, Languages, Moon, SunMoon } from 'lucide-react';
import { THEMES, useMapLook, isLite, featureName, hasNight } from '@/lib/mapTheme';

const Toggle = ({ on }) => (
  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#34A853]' : 'bg-muted'}`}>
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </span>
);

const RAYS = 'repeating-conic-gradient(from 0deg at 50% 100%, #c0172b 0 11.25deg, #060405 11.25deg 22.5deg)';

function Segmented({ value, options, onPick }) {
  return (
    <div className="flex bg-secondary rounded-lg p-0.5 flex-1">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onPick(k)} className={`flex-1 text-xs min-h-[40px] rounded-md ${value === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
      ))}
    </div>
  );
}

export function ThemePicker() {
  const [look, update] = useMapLook();
  const cur = THEMES.find((t) => t.key === look.theme);
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
        {THEMES.map((t) => {
          const on = look.theme === t.key;
          return (
            <button key={t.key} onClick={() => update({ theme: t.key })} title={t.label}
              className={`relative rounded-lg border p-1 min-h-[40px] text-left flex flex-col justify-center ${on ? 'border-primary bg-primary/10' : 'border-border bg-secondary/60'}`}>
              <div className="flex h-3.5 rounded overflow-hidden mb-1" style={t.rays ? { background: RAYS } : undefined}>
                {!t.rays && t.swatch.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
              </div>
              <div className="text-[10px] font-semibold text-foreground leading-tight truncate">{look.jpNames ? t.jp.split(' ')[0] : t.label}</div>
              {hasNight(t.key) && <Moon className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-muted-foreground" />}
              {on && <Check className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground p-0.5" />}
            </button>
          );
        })}
      </div>
      {cur && <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{cur.text}{hasNight(cur.key) ? ' Has a night version.' : ''}</p>}
    </div>
  );
}

// Profile → Map look: world theme, light / dark, battery saver, weather effects, Japanese names.
export default function MapLookSettings() {
  const [look, update] = useMapLook();
  const lite = isLite(look);
  return (
    <div className="bg-card rounded-2xl border border-border p-3 space-y-2.5">
      <h3 className="text-sm font-bold text-foreground">Map look</h3>
      <ThemePicker />
      <div className="flex items-center gap-2">
        <SunMoon className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-xs font-semibold text-foreground w-20 shrink-0">Light / dark</span>
        <Segmented value={look.mode} options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} onPick={(mode) => update({ mode })} />
      </div>
      <div className="flex items-center gap-2">
        <BatteryLow className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-xs font-semibold text-foreground w-20 shrink-0">Battery saver</span>
        <Segmented value={look.saver} options={[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]} onPick={(saver) => update({ saver })} />
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{lite ? 'Simple map on: no animations or 3D buildings.' : 'Full detail. Auto goes simple on older phones.'} Auto light/dark follows sunset.</p>
      <button onClick={() => update({ weatherFx: !look.weatherFx })} className="w-full flex items-center gap-2 text-left min-h-[40px]">
        <CloudSun className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-foreground">Live weather on the map</div><div className="text-[10px] text-muted-foreground truncate">Rain, fog, snow and clouds</div></div>
        <Toggle on={look.weatherFx} />
      </button>
      <button onClick={() => update({ jpNames: !look.jpNames })} className="w-full flex items-center gap-2 text-left min-h-[40px]">
        <Languages className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-foreground">Japanese feature names</div><div className="text-[10px] text-muted-foreground truncate">e.g. {featureName('map', true)}, {featureName('night', true)}</div></div>
        <Toggle on={look.jpNames} />
      </button>
    </div>
  );
}
