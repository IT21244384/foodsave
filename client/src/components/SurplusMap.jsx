import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';

function Recenter({ center, km }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L_bounds(center, km), { padding: [10, 10] });
  }, [map, center, km]);
  return null;
}

// Rough bounding box for a radius in km (good enough for zooming the map to the search circle).
function L_bounds([lat, lng], km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
}

// OpenStreetMap tiles via Leaflet – free, no API key or billing account (FR2.2).
export default function SurplusMap({ center, km, listings, highlight, onPick }) {
  return (
    <MapContainer className="map" center={center} zoom={13} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" referrerPolicy="strict-origin-when-cross-origin" />
      <Recenter center={center} km={km} />
      <Circle center={center} radius={km * 1000} pathOptions={{ color: '#6E9F45', weight: 1.5, dashArray: '6 6', fillOpacity: 0.08 }} />
      <CircleMarker center={center} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2F7DD1', fillOpacity: 1 }}>
        <Tooltip>You are here</Tooltip>
      </CircleMarker>
      {listings.map((l) => (
        <CircleMarker
          key={l.id}
          center={[l.location.coordinates[1], l.location.coordinates[0]]}
          radius={highlight === l.id ? 13 : 10}
          pathOptions={{ color: '#fff', weight: 2, fillColor: l.offerType === 'donate' ? '#E4572E' : '#1F4D3A', fillOpacity: 1 }}
          eventHandlers={{ click: () => onPick(l.id) }}
        >
          <Tooltip>{l.item} · {l.restaurant.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
