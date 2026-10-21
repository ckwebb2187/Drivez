import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function MapController({ center, follow, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (follow && center) {
      map.panTo(center, { animate: true, duration: 0.4 });
    }
  }, [center, follow, map]);
  useEffect(() => {
    if (zoom !== undefined) {
      map.setZoom(zoom);
    }
  }, [zoom, map]);
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  useEffect(() => {
    const handler = () => map.invalidateSize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [map]);
  return null;
}

export default function DarkMap({
  center = [37.7749, -122.4194],
  zoom = 14,
  follow = false,
  children,
  className = ''
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={`map-dark ${className}`}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIB} maxZoom={19} />
      <MapResizer />
      {follow && <MapController center={center} follow={follow} zoom={zoom} />}
      {children}
    </MapContainer>
  );
}
