// Garage helpers: odometer (your number + miles driven in the app since) and service reminders.

export const SERVICE_KINDS = [
  { key: 'oil', label: 'Oil change', miles: 5000, months: 6, on: true },
  { key: 'tires', label: 'Tire rotation', miles: 7500, on: true },
  { key: 'air', label: 'Engine air filter', miles: 30000, on: true },
  { key: 'brake_fluid', label: 'Brake fluid', miles: 30000, months: 24, on: true },
  { key: 'trans', label: 'Transmission / diff fluid', miles: 30000, on: false },
  { key: 'plugs', label: 'Spark plugs', miles: 60000, on: true },
  { key: 'coolant', label: 'Coolant', miles: 100000, months: 120, on: false },
  { key: 'timing_belt', label: 'Timing belt', miles: 105000, months: 105, on: true },
  { key: 'other', label: 'Other', miles: 0, on: false },
];
export const kindOf = (key) => SERVICE_KINDS.find((k) => k.key === key) || SERVICE_KINDS[SERVICE_KINDS.length - 1];

export const MOD_CATEGORIES = ['Engine', 'Intake / Exhaust', 'Turbo', 'Tune', 'Suspension', 'Wheels / Tires', 'Brakes', 'Exterior', 'Interior', 'Lighting', 'Audio', 'Other'];

export const newId = () => Math.random().toString(36).slice(2, 10);

// Miles driven in the app with this car after a given date. Drives marked as not
// counting (phone wasn't on the car's Bluetooth — e.g. you were a passenger) are skipped.
export function appMilesSince(trips, vehicleId, sinceIso) {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  return trips
    .filter((t) => t.vehicleId === vehicleId && t.odo !== false && new Date(t.start_time || t.date).getTime() > since)
    .reduce((s, t) => s + (t.distance || 0), 0);
}

// Current odometer, or null until you've entered a starting reading.
export function odometer(vehicle, trips) {
  if (vehicle?.odometer_base == null) return null;
  if (vehicle.mileage_mode === 'manual') return Math.round(vehicle.odometer_base);
  return Math.round(vehicle.odometer_base + appMilesSince(trips, vehicle.id, vehicle.odometer_base_date));
}

// Which services to track for this car (your on/off choice, else the default).
export function trackedKinds(vehicle) {
  const prefs = vehicle?.service_prefs || {};
  return SERVICE_KINDS.filter((k) => k.key !== 'other').map((k) => ({
    ...k,
    miles: prefs[k.key]?.miles ?? k.miles,
    on: prefs[k.key]?.on ?? k.on,
  }));
}

// One entry per tracked service: when it was last done and how far until it's due.
export function reminders(vehicle, trips) {
  const odo = odometer(vehicle, trips);
  const log = vehicle?.services || [];
  return trackedKinds(vehicle).filter((k) => k.on && k.miles > 0).map((k) => {
    const last = log.filter((s) => s.kind === k.key).sort((a, b) => (b.miles || 0) - (a.miles || 0) || String(b.date).localeCompare(String(a.date)))[0] || null;
    let milesLeft = null, daysLeft = null;
    if (last && last.miles != null && odo != null) milesLeft = last.miles + k.miles - odo;
    if (last && last.date && k.months) {
      const due = new Date(last.date);
      due.setMonth(due.getMonth() + k.months);
      daysLeft = Math.round((due.getTime() - Date.now()) / 86400000);
    }
    let status = 'unknown';
    if (milesLeft != null || daysLeft != null) {
      const overdue = (milesLeft != null && milesLeft <= 0) || (daysLeft != null && daysLeft <= 0);
      const soon = (milesLeft != null && milesLeft <= Math.max(500, k.miles * 0.1)) || (daysLeft != null && daysLeft <= 30);
      status = overdue ? 'overdue' : soon ? 'soon' : 'ok';
    }
    return { ...k, last, milesLeft, daysLeft, status };
  });
}

export function dueText(r) {
  if (r.status === 'unknown') return 'Log the last one to start tracking';
  const parts = [];
  if (r.milesLeft != null) parts.push(r.milesLeft <= 0 ? `${Math.abs(Math.round(r.milesLeft)).toLocaleString()} mi overdue` : `${Math.round(r.milesLeft).toLocaleString()} mi left`);
  if (r.daysLeft != null && (r.milesLeft == null || r.daysLeft < 60)) parts.push(r.daysLeft <= 0 ? `${Math.abs(r.daysLeft)} days overdue` : `${r.daysLeft} days left`);
  return parts.join(' · ');
}
