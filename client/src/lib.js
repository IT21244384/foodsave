// Small shared helpers for formatting and client-side checks.

export const rs = (n) => `Rs ${Number(n).toLocaleString('en-LK')}`;

export function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-LK', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(d) {
  return new Date(d).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function timeLeft(until, now = Date.now()) {
  const mins = Math.round((new Date(until) - now) / 60000);
  if (mins <= 0) return 'expired';
  const h = Math.floor(mins / 60);
  return `${h ? `${h} h ` : ''}${mins % 60} min left`;
}

// Value for <input type="datetime-local"> in local time.
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const inMinutes = (m) => toLocalInput(Date.now() + m * 60000);

// Same rules as the server (FR1.3), so users see problems before they submit.
export function checkListing(v, now = new Date()) {
  const e = {};
  if (!v.item || v.item.trim().length < 2) e.item = 'Enter an item name.';
  if (!(Number(v.quantity) >= 1)) e.quantity = 'Quantity must be at least 1.';
  else if (Number(v.quantity) > 500) e.quantity = 'Quantity cannot exceed 500.';
  if (!(Number(v.originalPrice) >= 0) || v.originalPrice === '') e.originalPrice = 'Enter the original price.';
  const from = new Date(v.pickupFrom); const to = new Date(v.pickupTo); const safe = new Date(v.safeUntil);
  if (!v.pickupFrom) e.pickupFrom = 'Choose a pickup start time.';
  if (!v.pickupTo) e.pickupTo = 'Choose a pickup end time.';
  else if (to <= from) e.pickupTo = 'Pickup end must be after pickup start.';
  else if (to <= now) e.pickupTo = 'The pickup window has already ended.';
  if (!v.safeUntil) e.safeUntil = 'Choose a safe-until time.';
  else if (safe <= to) e.safeUntil = 'Safe-until must be after the pickup window ends.';
  else if (v.category === 'Cooked' && safe - now > 6 * 3600 * 1000) e.safeUntil = 'Cooked food can be held for at most 6 hours from now.';
  if (v.offerType === 'sale') {
    if (!(Number(v.price) > 0)) e.price = 'Enter a discounted price.';
    else if (Number(v.price) >= Number(v.originalPrice)) e.price = 'Discounted price must be lower than the original price.';
  }
  if (!v.hygieneDeclared) e.hygieneDeclared = 'Tick the hygiene declaration to publish.';
  return e;
}

// Preset locations so the demo works without GPS. Coordinates are approximate area centres.
export const PLACES = [
  { name: 'SLIIT, Malabe', lat: 6.9147, lng: 79.9729 },
  { name: 'Malabe town', lat: 6.9061, lng: 79.9696 },
  { name: 'Kaduwela', lat: 6.9305, lng: 79.984 },
  { name: 'Battaramulla', lat: 6.899, lng: 79.933 },
  { name: 'Colombo 03', lat: 6.911, lng: 79.851 },
];
