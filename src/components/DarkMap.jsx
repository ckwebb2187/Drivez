import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';

// Sharp vector map (OpenFreeMap "dark" style, free, no key). Draws crisply on
// high-resolution phone screens. Falls back to OpenStreetMap images if WebGL is off.
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const ATTRIB = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function VectorBase() {
  const map = useMap();
  useEffect(() => {
    const layer = L.maplibreGL({ style: VECTOR_STYLE, attribution: ATTRIB, interactive: false });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map]);
  return null;
}

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
  const [vector] = useState(webglAvailable);
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={`${vector ? '' : 'map-dark'} ${className}`}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      {vector ? (
        <VectorBase />
      ) : (
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
          detectRetina
        />
      )}
      <MapResizer />
      {follow && <MapController center={center} follow={follow} zoom={zoom} />}
      {children}
    </MapContainer>
  );
}
