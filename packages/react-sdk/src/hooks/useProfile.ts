import { useState, useEffect, useRef, useCallback } from 'react';
import { BeacioError } from '@beacio/core';
import type { BeacioDevice } from '@beacio/core';

/**
 * Hook that wraps a {@link BaseProfile} subclass from `@beacio/core/profiles`.
 *
 * Manages profile instantiation, connection, and teardown tied to the
 * React component lifecycle. A new profile instance is created whenever
 * the `device` reference changes, and {@link BaseProfile.stop} is called
 * automatically on unmount or device change.
 *
 * @typeParam T - The profile class type (must have `connect()` and `stop()`).
 * @param ProfileClass - The profile constructor (e.g. `HeartRateProfile`).
 * @param device - The BeacioDevice to bind to, or `null` if not yet available.
 * @returns An object with the profile instance, a `connect` function, and error state.
 *
 * @example
 * ```tsx
 * import { useProfile } from '@beacio/react';
 * import { HeartRateProfile } from '@beacio/core/profiles';
 * import type { BeacioDevice } from '@beacio/core';
 *
 * function HeartRateMonitor({ device }: { device: BeacioDevice }) {
 *   const { profile, connect, error } = useProfile(HeartRateProfile, device);
 *   const [bpm, setBpm] = useState<number | null>(null);
 *
 *   useEffect(() => {
 *     connect().then(() => {
 *       profile?.onHeartRate((data) => setBpm(data.bpm));
 *     });
 *   }, [profile]);
 *
 *   return (
 *     <div>
 *       {bpm !== null ? <p>{bpm} BPM</p> : <p>Connecting...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useProfile<T extends { connect(): Promise<void>; stop(): void }>(
  ProfileClass: new (device: BeacioDevice) => T,
  device: BeacioDevice | null,
): { profile: T | null; connect: () => Promise<void>; error: BeacioError | null } {
  const [profile, setProfile] = useState<T | null>(null);
  const [error, setError] = useState<BeacioError | null>(null);
  const profileRef = useRef<T | null>(null);

  // Create profile instance when device changes
  useEffect(() => {
    if (!device) {
      setProfile(null);
      profileRef.current = null;
      return;
    }

    const instance = new ProfileClass(device);
    profileRef.current = instance;
    setProfile(instance);
    setError(null);

    return () => {
      instance.stop();
      profileRef.current = null;
      setProfile(null);
    };
  }, [ProfileClass, device]);

  const connect = useCallback(async () => {
    if (!profileRef.current) return;
    try {
      setError(null);
      await profileRef.current.connect();
    } catch (e) {
      setError(BeacioError.from(e));
    }
  }, []);

  return { profile, connect, error };
}
