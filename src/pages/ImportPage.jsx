import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Upload, Loader2, CheckCircle2, MapPin, Car, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '@/api/base44Client';
import { useApp } from '@/lib/AppContext';
import { readExportFiles, lookupMissing } from '@/lib/importers';

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <span className="text-xs text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

function Guide({ title, children }) {
  return (
    <details className="bg-card rounded-2xl border border-border mb-3 group">
      <summary className="px-4 py-3 text-sm font-bold text-foreground cursor-pointer list-none flex items-center justify-between">
        {title} <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <ol className="px-4 pb-4 space-y-2">{children}</ol>
    </details>
  );
}

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">{children}<ExternalLink className="w-3 h-3" /></a>
);

export default function ImportPage() {
  const navigate = useNavigate();
  const { refreshData } = useApp();
  const fileRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setError(''); setDone(null); setFound(null);
    try {
      const r = await readExportFiles(files, setStatus);
      if (r.places.some((p) => p.needsLookup)) r.places = await lookupMissing(r.places, setStatus);
      if (!r.places.length && !r.trips.length) {
        setError(r.encrypted
          ? 'That zip is password-protected (Waze does this). Unzip it first with the password Waze emailed you, then pick the .csv files inside.'
          : 'No places or drives were found in those files. Check the steps below for which files to pick.');
      } else setFound(r);
    } catch (err) {
      setError(err.message || 'Could not read those files.');
    } finally {
      setBusy(false); setStatus('');
    }
  };

  const runImport = async () => {
    if (!found) return;
    setBusy(true); setError('');
    const total = { places: 0, trips: 0, skipped: 0 };
    try {
      const P = found.places, T = found.trips;
      for (let i = 0; i < P.length; i += 500) {
        setStatus(`Saving places… ${Math.min(i + 500, P.length)} of ${P.length}`);
        const r = await api.post('/import', { places: P.slice(i, i + 500) });
        total.places += r.places; total.skipped += r.skipped;
      }
      for (let i = 0; i < T.length; i += 100) {
        setStatus(`Saving drives… ${Math.min(i + 100, T.length)} of ${T.length}`);
        const r = await api.post('/import', { trips: T.slice(i, i + 100) });
        total.trips += r.trips; total.skipped += r.skipped;
      }
      await refreshData();
      setDone(total); setFound(null);
    } catch (err) {
      setError(`${err.message || 'Import stopped.'} Anything already saved is kept. Try again to finish; nothing gets added twice.`);
    } finally {
      setBusy(false); setStatus('');
    }
  };

  const bySource = (arr, s) => arr.filter((x) => x.source === s).length;

  return (
    <div className="min-h-full pb-28">
      <div className="px-5 pt-12 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass border border-border flex items-center justify-center" aria-label="Back">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Import</h1>
          <p className="text-[11px] text-muted-foreground">Saved places and drives from Google Maps and Waze</p>
        </div>
      </div>

      <div className="px-5">
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Google and Waze don’t let other apps read your account, so you download your data from them first, then pick the files here.
          Your files are read on this phone. Only the places and drives are saved, and importing twice won’t create duplicates.
        </p>

        <Guide title="Google Maps saved places">
          <Step n={1}>Open <A href="https://takeout.google.com/">Google Takeout</A> and tap <b>Deselect all</b>.</Step>
          <Step n={2}>Tick <b>Maps (your places)</b> and <b>Saved</b>, then <b>Next step</b> → <b>Create export</b>.</Step>
          <Step n={3}>When Google emails you, download the .zip.</Step>
          <Step n={4}>Tap <b>Choose files</b> below and pick that .zip (or the <i>Saved Places.json</i> and list .csv files inside it).</Step>
        </Guide>

        <Guide title="Google Maps drives (Timeline)">
          <Step n={1}>On your Android phone, open <b>Settings → Location → Location services → Timeline</b>.</Step>
          <Step n={2}>Tap <b>Export Timeline data</b> and save the <i>Timeline.json</i> file.</Step>
          <Step n={3}>Tap <b>Choose files</b> below and pick <i>Timeline.json</i>. Only driving trips are imported.</Step>
          <Step n={4}>Older Takeout exports also work: pick the files in <i>Semantic Location History</i>.</Step>
        </Guide>

        <Guide title="Waze drives and favorites">
          <Step n={1}>Open <A href="https://www.waze.com/account/download_data">Waze: Download your data</A> and request your data.</Step>
          <Step n={2}>Waze emails a password-protected .zip. Open it with the password from the email (Files by Google or any unzip app can do this).</Step>
          <Step n={3}>Tap <b>Choose files</b> below and pick the .csv files from inside it.</Step>
          <Step n={4}>Waze only shares your last 90 days of drives. Drive distances are estimated, since Waze gives only start and end points.</Step>
        </Guide>

        <p className="text-[11px] text-muted-foreground mb-4">Also works with .kml (Google My Maps) and .gpx files.</p>

        <input ref={fileRef} type="file" multiple accept=".zip,.json,.geojson,.csv,.kml,.gpx,.txt,application/zip,application/json,text/csv" className="hidden" onChange={onFiles} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? status || 'Working…' : 'Choose files'}
        </button>

        {error && (
          <div className="mt-4 bg-destructive/10 border border-destructive/40 rounded-2xl p-3 text-xs text-destructive flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {found && !busy && (
          <div className="mt-4 bg-card border border-border rounded-2xl p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">Found in your files</h2>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-secondary/60 rounded-xl p-3">
                <MapPin className="w-4 h-4 text-primary mb-1" />
                <div className="text-lg font-bold text-foreground">{found.places.length.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Saved places</div>
              </div>
              <div className="bg-secondary/60 rounded-xl p-3">
                <Car className="w-4 h-4 text-accent mb-1" />
                <div className="text-lg font-bold text-foreground">{found.trips.length.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Drives</div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              {[['google', 'Google'], ['waze', 'Waze'], ['gpx', 'GPX']].map(([k, label]) => {
                const n = bySource(found.places, k) + bySource(found.trips, k);
                return n ? `${label}: ${n.toLocaleString()} ` : '';
              }).join('· ').replace(/· $/, '')}
              {found.trips.length > 0 && ` · ${found.trips[0].start_time.slice(0, 10)} to ${found.trips[found.trips.length - 1].start_time.slice(0, 10)}`}
            </p>
            <button onClick={runImport} className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm">Import all</button>
          </div>
        )}

        {done && (
          <div className="mt-4 bg-card border border-border rounded-2xl p-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-bold text-foreground">Imported {done.places.toLocaleString()} places and {done.trips.toLocaleString()} drives</p>
            {done.skipped > 0 && <p className="text-[11px] text-muted-foreground mt-1">{done.skipped.toLocaleString()} were already in Kaido Maps, so they were skipped.</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => navigate('/places')} className="flex-1 bg-secondary rounded-xl py-2.5 text-xs font-bold text-foreground">See places</button>
              <button onClick={() => navigate('/history')} className="flex-1 bg-secondary rounded-xl py-2.5 text-xs font-bold text-foreground">See drives</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
