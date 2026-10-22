// Waze-style floating shortcut that opens YumaPlayer (github.com/MuwMx/YumaPlayer).
// Android Chrome opens the installed app by its package name; if it isn't
// installed, the fallback link goes to the YumaPlayer releases page.
const PACKAGE = 're.muwmix.yumaplayer';
const FALLBACK = 'https://github.com/MuwMx/YumaPlayer/releases';
const INTENT = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(FALLBACK)};end`;

const isAndroid = () => /android/i.test(navigator.userAgent);

export default function MusicButton({ className = '', size = 52 }) {
  const open = () => {
    if (isAndroid()) window.location.href = INTENT;
    else window.open(FALLBACK, '_blank', 'noopener');
  };
  return (
    <button
      onClick={open}
      aria-label="Open YumaPlayer"
      title="YumaPlayer"
      className={`relative rounded-full p-[2.5px] shadow-xl active:scale-95 transition-transform ${className}`}
      style={{ width: size, height: size, background: 'conic-gradient(from 200deg, #7cc8ff, #c39bff, #ff8fd0, #7cc8ff)' }}
    >
      <span className="flex items-center justify-center w-full h-full rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #2a2a3d, #0e0e16 70%)' }}>
        <img src="/yuma.png" alt="" className="w-[62%] h-[62%] object-contain drop-shadow-[0_0_6px_rgba(255,143,208,0.55)]" />
      </span>
    </button>
  );
}
