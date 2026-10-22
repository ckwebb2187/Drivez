export default function RouteThumbnail({ route, className = '', color = '#00BFFF', showGradient = true }) {
  if (!route || route.length < 2) {
    return <div className={`bg-secondary ${className}`} />;
  }

  // A thumbnail only needs ~60 points; long drives have hundreds.
  if (route.length > 60) {
    const step = Math.ceil(route.length / 60);
    route = route.filter((_, i) => i % step === 0 || i === route.length - 1);
  }
  const lats = route.map(p => p[0]);
  const lngs = route.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;
  const aspect = lngRange / latRange;

  const vw = 100, vh = aspect > 1 ? 100 / aspect : 100;
  const w = aspect > 1 ? vw : vh * aspect;
  const h = aspect > 1 ? vw / aspect : vh;
  const ox = (vw - w) / 2, oy = (vh - h) / 2;

  const pts = route.map(([lat, lng]) => {
    const x = ox + ((lng - minLng) / lngRange) * w;
    const y = oy + (1 - (lat - minLat) / latRange) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className={className} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showGradient && (
        <>
          <circle cx={pts.split(' ')[0].split(',')[0]} cy={pts.split(' ')[0].split(',')[1]} r="3" fill={color} opacity="0.4" />
          <circle cx={pts.split(' ').pop().split(',')[0]} cy={pts.split(' ').pop().split(',')[1]} r="3" fill="#39FF14" opacity="0.8" />
        </>
      )}
    </svg>
  );
}
