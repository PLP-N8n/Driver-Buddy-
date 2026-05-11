import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoTripDetection } from '../useAutoTripDetection';

// Capture the watchPosition callback so we can simulate position updates
let watchCallback: ((pos: GeolocationPosition) => void) | null = null;
let watchErrorCallback: ((err: GeolocationPositionError) => void) | null = null;
let watchIdCounter = 0;

function makeCoords(speed: number | null, lat: number, lon: number): GeolocationCoordinates {
  return {
    latitude: lat,
    longitude: lon,
    altitude: null,
    accuracy: 10,
    altitudeAccuracy: null,
    heading: null,
    speed,
    toJSON() { return this; },
  };
}

function mockPosition(speed: number | null, lat = 55.9533, lon = -3.1883): GeolocationPosition {
  const coords = makeCoords(speed, lat, lon);
  return {
    coords,
    timestamp: Date.now(),
    toJSON() { return { coords, timestamp: this.timestamp }; },
  };
}

function makePositionError(code: number, message: string): GeolocationPositionError {
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

beforeEach(() => {
  watchCallback = null;
  watchErrorCallback = null;
  watchIdCounter = 0;

  const watchPosition = vi.fn(
    (
      onSuccess: (pos: GeolocationPosition) => void,
      onError?: (err: GeolocationPositionError) => void,
    ) => {
      watchCallback = onSuccess;
      watchErrorCallback = onError ?? null;
      watchIdCounter += 1;
      return watchIdCounter;
    },
  );

  const clearWatch = vi.fn(() => {
    watchCallback = null;
    watchErrorCallback = null;
  });

  vi.stubGlobal('navigator', {
    geolocation: { watchPosition, clearWatch },
  });
});

function simulatePosition(speed: number | null, lat?: number, lon?: number) {
  act(() => {
    watchCallback?.(mockPosition(speed, lat, lon));
  });
}

function simulateError(code = 1, message = 'Permission denied') {
  act(() => {
    watchErrorCallback?.(makePositionError(code, message));
  });
}

describe('useAutoTripDetection', () => {
  it('returns idle state when disabled', () => {
    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(false, onTripComplete));

    expect(result.current.state).toBe('idle');
  });

  it('transitions idle → detecting when speed exceeds threshold', () => {
    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0); // > 6.7 m/s (~15 mph)

    expect(result.current.state).toBe('detecting');
  });

  it('transitions detecting → driving after 30s sustained speed', () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    expect(result.current.state).toBe('detecting');

    now += 31_000;
    simulatePosition(7.0);
    expect(result.current.state).toBe('driving');

    vi.restoreAllMocks();
  });

  it('returns to idle if speed drops below threshold during detecting', () => {
    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    expect(result.current.state).toBe('detecting');

    simulatePosition(0);
    expect(result.current.state).toBe('idle');
  });

  it('transitions driving → stopping when speed drops below threshold', () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    now += 31_000;
    simulatePosition(7.0);
    expect(result.current.state).toBe('driving');

    simulatePosition(0);
    expect(result.current.state).toBe('stopping');
    vi.restoreAllMocks();
  });

  it('returns to driving if speed resumes during stopping', () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    now += 31_000;
    simulatePosition(7.0);
    expect(result.current.state).toBe('driving');

    simulatePosition(0);
    expect(result.current.state).toBe('stopping');

    simulatePosition(8.0);
    expect(result.current.state).toBe('driving');
    vi.restoreAllMocks();
  });

  it('calls onTripComplete with valid trip data', () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0, 55.9533, -3.1883);
    now += 31_000;
    simulatePosition(7.0, 55.9600, -3.1700);
    expect(result.current.state).toBe('driving');

    simulatePosition(0, 55.9600, -3.1700);
    now += 121_000;
    simulatePosition(0, 55.9600, -3.1700);

    expect(onTripComplete).toHaveBeenCalledTimes(1);
    const trip: any = onTripComplete.mock.calls[0]![0];
    expect(trip.purpose).toBe('Business');
    expect(trip.totalMiles).toBeGreaterThan(0.3);
    expect(trip.notes).toContain('Auto-detected');
    vi.restoreAllMocks();
  });

  it('finishes trip early on geolocation error while driving', () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    now += 31_000;
    simulatePosition(7.0);
    expect(result.current.state).toBe('driving');

    // Geolocation error while driving
    simulatePosition(7.0, 55.9533, -3.1883);
    simulatePosition(7.0, 55.9600, -3.1700);
    simulateError();

    expect(result.current.state).toBe('idle');
    vi.restoreAllMocks();
  });

  it('cancelTrip resets state to idle', () => {
    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    simulatePosition(7.0);
    expect(result.current.state).toBe('detecting');

    act(() => { result.current.cancelTrip(); });

    expect(result.current.state).toBe('idle');
  });

  it('does not break when navigator.geolocation is missing', () => {
    vi.stubGlobal('navigator', {});
    const onTripComplete = vi.fn();
    const { result } = renderHook(() => useAutoTripDetection(true, onTripComplete));

    expect(result.current.state).toBe('idle');
  });
});
