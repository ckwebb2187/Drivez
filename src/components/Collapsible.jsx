import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A compact row that opens to show its contents. Contents only load when opened,
// which keeps heavy things (maps, charts) from slowing the page down.
export default function Collapsible({ icon: Icon, title, subtitle, right, defaultOpen = false, children, id }) {
  const key = id ? `dz-open-${id}` : null;
  const [open, setOpen] = useState(() => { try { return key ? sessionStorage.getItem(key) === '1' || defaultOpen : defaultOpen; } catch { return defaultOpen; } });
  const toggle = () => { const v = !open; setOpen(v); try { if (key) sessionStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ } };
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {right}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // Hide each section's own heading: the row above already names it.
        <div className="px-3 pb-3 [&>*>h3:first-child]:hidden [&>*>div:first-child>h3]:hidden">
          {children}
        </div>
      )}
    </div>
  );
}
