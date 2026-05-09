import { useCallback, useEffect, useRef, useState } from 'react';
import { Trip } from '../types';
import { todayUK } from '../utils/ukDate';

const DRIVING_SPEED_MPS = 6.7; // ~15 mph
const DRIVING_DURATION_MS = 30_000; // must maintain speed for 30s
const STOP_DURATION_MS = 120_000; // stop when stationary for 2min
const MIN_TRIP_MILES = 0.3;

export type AutoTripState = 'idle' | 'detecting' | 'driving' | 'stopping';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

export type AutoTripSummary = {
  id: string;
  date: string;
  startLocation: string;
  endLocation: string;
  startOdometer: number;
  endOdometer: number;
  totalMiles: number;
  purpose: 'Business';
  notes: string;
};

export function useAutoTripDetection(enabled: boolean, onTripComplete: (trip: Trip) => void) {
  const [state, setState] = useState<AutoTripState>('idle');
  const watchIdRef = useRef<number | null>(null);
  const drivingStartRef = useRef<number | null>(null);
  const stopStartRef = useRef<number | null>(null);
  const positionsRef = useRef<GeolocationPosition[]>([]);
  const stateRef = useRef<AutoTripState>('idle');

  const startTrip = useCallback(() => {
    positionsRef.current = [];
    drivingStartRef.current = null;
    stopStartRef.current = null;
    setState('idle');
    stateRef.current = 'idle';
  }, []);

  const finishTrip = useCallback(() => {
    const positions = positionsRef.current;
    if (positions.length < 2) {
      startTrip();
      return;
    }

    const first = positions[0];
    const last = positions[positions.length - 1];
    if (!first || !last) {
      startTrip();
      return;
    }
    const distanceMeters = calculateDistance(positions);
    const miles = distanceMeters / 1609.34;

    if (miles < MIN_TRIP_MILES) {
      startTrip();
      return;
    }

    const trip: Trip = {
      id: `trip_auto_${generateId().slice(0, 8)}_${Date.now()}`,
      date: todayUK(),
      startLocation: formatCoord(first.coords.latitude, first.coords.longitude),
      endLocation: formatCoord(last.coords.latitude, last.coords.longitude),
      startOdometer: 0,
      endOdometer: Math.round(miles * 10) / 10,
      totalMiles: Math.round(miles * 10) / 10,
      purpose: 'Business',
      notes: `Auto-detected trip`,
      updatedAt: new Date().toISOString(),
    };

    onTripComplete(trip);
    startTrip();
  }, [onTripComplete, startTrip]);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      startTrip();
      return;
    }

    if (!navigator.geolocation) {
      setState('idle');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const speed = position.coords.speed ?? 0;
        positionsRef.current.push(position);
        // Keep last 300 positions (~5 min at 1Hz)
        if (positionsRef.current.length > 300) {
          positionsRef.current = positionsRef.current.slice(-300);
        }

        const now = Date.now();
        const currentState = stateRef.current;

        if (currentState === 'idle') {
          if (speed >= DRIVING_SPEED_MPS) {
            if (!drivingStartRef.current) {
              drivingStartRef.current = now;
            } else if (now - drivingStartRef.current >= DRIVING_DURATION_MS) {
              setState('driving');
              stateRef.current = 'driving';
              drivingStartRef.current = null;
            }
          } else {
            drivingStartRef.current = null;
          }
        } else if (currentState === 'driving') {
          if (speed < DRIVING_SPEED_MPS) {
            if (!stopStartRef.current) {
              stopStartRef.current = now;
            } else if (now - stopStartRef.current >= STOP_DURATION_MS) {
              finishTrip();
            }
          } else {
            stopStartRef.current = null;
          }
        }
      },
      (err) => {
        console.warn('[AutoTrip] geolocation error:', err.message);
        if (stateRef.current === 'driving') {
          finishTrip();
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, startTrip, finishTrip]);

  return { state, startTrip };
}

function calculateDistance(positions: GeolocationPosition[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    if (!prev || !curr) continue;
    total += haversine(
      prev.coords.latitude,
      prev.coords.longitude,
      curr.coords.latitude,
      curr.coords.longitude
    );
  }
  return total;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
