import { BeacioError } from './errors';
import { resolveUUID } from './uuid';
import type {
  DeviceErrorContext,
  NotificationCallback,
  NotificationOptions,
  QueueOverflowEvent,
  SubscribeOptions,
  SubscriptionLostEvent,
} from './types';

// AIDEV-NOTE: Runtime, per-characteristic notification state. `reconcilePromise`
// is the serialization chain that keeps subscribe()/notifications() lifecycles
// from diverging during async start/stop races.
export type NotificationState = {
  callbacks: Set<NotificationCallback>;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  listenerAttached: boolean;
  nativeActive: boolean;
  reconcilePromise: Promise<void> | null;
};

// AIDEV-NOTE: Auto-recovery registry entry. Owned by BeacioDevice and passed to
// the manager BY REFERENCE — the device must keep reading/clearing it across
// connect()/disconnect(), so both objects share the same Map instance.
export type RecoveryEntry = { service: string; characteristic: string; callbacks: Set<NotificationCallback> };

type ReconnectGate = { promise: Promise<void>; resolve: () => void };

/**
 * Dependencies injected by {@link BeacioDevice}. The device retains ownership of
 * the GATT connection, the recovery registry, the characteristic cache, and the
 * reconnect-gate lifecycle; the manager reaches into those via these bindings so
 * the gate's create-before-fire / resolve-in-finally timing is unchanged.
 */
export type NotificationManagerDeps = {
  getCharacteristic: (service: string, characteristic: string) => Promise<BluetoothRemoteGATTCharacteristic>;
  emitError: (error: Error, context: DeviceErrorContext) => void;
  emitSubscriptionLost: (event: SubscriptionLostEvent) => void;
  emitQueueOverflow: (event: QueueOverflowEvent) => void;
  // Shared by reference with BeacioDevice.
  recoveryRegistry: Map<string, RecoveryEntry>;
  charCache: Map<string, BluetoothRemoteGATTCharacteristic>;
  // Live reads of the device's reconnect-gate / disconnect intent.
  getReconnectGate: () => ReconnectGate | null;
  isIntentionalDisconnect: () => boolean;
};

/**
 * Owns the runtime notification subscription lifecycle: native start/stop
 * reconciliation, listener fan-out, the callback / async-iterator surfaces, and
 * auto-recovery after reconnect.
 *
 * AIDEV-NOTE: Extracted from device.ts (cleanup item 144). Behavior is
 * byte-identical to the former BeacioDevice methods. The reconcilePromise
 * serialization chain and reconnect-gate await semantics are preserved exactly.
 */
export class NotificationManager {
  // AIDEV-NOTE: PERF — Keep this low enough to avoid hidden memory growth while
  // still absorbing short consumer stalls without spurious overflow failures.
  static readonly DEFAULT_NOTIFICATION_QUEUE_SIZE = 256;

  private notificationStates = new Map<string, NotificationState>();

  constructor(private readonly deps: NotificationManagerDeps) {}

  /** Read-only access for BeacioDevice.getActiveSubscriptions(). */
  getNotificationStates(): ReadonlyMap<string, NotificationState> {
    return this.notificationStates;
  }

  subscribe(service: string, characteristic: string, callback: NotificationCallback, options?: SubscribeOptions): () => void {
    const { unsubscribe, ready } = this.registerNotificationConsumer(service, characteristic, callback);
    void ready.catch((error) => {
      const normalizedError = BeacioError.from(error);
      try {
        options?.onError?.(normalizedError);
      } catch (listenerError) {
        this.deps.emitError(BeacioError.from(listenerError), {
          operation: 'device.subscribe.onError',
          service,
          characteristic,
        });
      }
    });

    const autoRecover = options?.autoRecover ?? true;

    if (autoRecover) {
      this.addToRecoveryRegistry(this.charKey(service, characteristic), service, characteristic, callback);
    }

    const originalUnsubscribe = unsubscribe;
    return () => {
      originalUnsubscribe();
      if (autoRecover) {
        this.removeFromRecoveryRegistry(this.charKey(service, characteristic), callback);
      }
    };
  }

  async subscribeAsync(
    service: string,
    characteristic: string,
    callback: NotificationCallback,
    options?: SubscribeOptions,
  ): Promise<() => void> {
    const { unsubscribe, release, ready } = this.registerNotificationConsumer(service, characteristic, callback);
    const autoRecover = options?.autoRecover ?? true;

    if (autoRecover) {
      this.addToRecoveryRegistry(this.charKey(service, characteristic), service, characteristic, callback);
    }

    try {
      await ready;
    } catch (error) {
      const normalizedError = BeacioError.from(error);
      // AIDEV-NOTE: Unlike sync subscribe(), subscribeAsync surfaces errors via throw only.
      // Calling onError here would double-report since the caller already gets the rejection.

      await release();
      if (autoRecover) {
        this.removeFromRecoveryRegistry(this.charKey(service, characteristic), callback);
      }
      throw normalizedError;
    }

    return () => {
      unsubscribe();
      if (autoRecover) {
        this.removeFromRecoveryRegistry(this.charKey(service, characteristic), callback);
      }
    };
  }

  async *notifications(service: string, characteristic: string, options: NotificationOptions = { maxQueueSize: NotificationManager.DEFAULT_NOTIFICATION_QUEUE_SIZE }): AsyncIterable<DataView> {
    const maxQueueSize = this.validateMaxQueueSize(
      options.maxQueueSize ?? NotificationManager.DEFAULT_NOTIFICATION_QUEUE_SIZE,
    );
    const overflowStrategy = options?.overflowStrategy ?? 'error';
    const queue: DataView[] = [];
    let droppedCount = 0;
    type Resolver = (v: IteratorResult<DataView>) => void;
    type Rejecter = (reason?: unknown) => void;
    const state: { resolve: Resolver | null; reject: Rejecter | null; done: boolean; failure: Error | null } = {
      resolve: null,
      reject: null,
      done: false,
      failure: null,
    };

    const callback: NotificationCallback = (value) => {
      if (state.failure) return;

      if (state.resolve) {
        const r = state.resolve;
        state.resolve = null;
        state.reject = null;
        r({ value, done: false });
      } else {
        if (queue.length >= maxQueueSize) {
          droppedCount += 1;
          const overflowEvent: QueueOverflowEvent = {
            service,
            characteristic,
            strategy: overflowStrategy,
            queueSize: maxQueueSize,
            droppedCount,
          };
          this.deps.emitQueueOverflow(overflowEvent);

          try {
            options?.onOverflow?.(overflowEvent);
          } catch (error) {
            this.deps.emitError(BeacioError.from(error), {
              operation: 'device.notifications.onOverflow',
              service,
              characteristic,
            });
          }

          if (overflowStrategy === 'error') {
            const overflowError = new BeacioError(
              'GATT_OPERATION_FAILED',
              `Notification queue overflowed (maxQueueSize=${maxQueueSize}). Increase queue size or consume faster.`,
            );
            state.failure = overflowError;
            const reject = state.reject;
            state.resolve = null;
            state.reject = null;
            reject?.(overflowError);
            return;
          }

          if (overflowStrategy === 'drop-oldest') {
            queue.shift();
          }

          if (overflowStrategy === 'drop-newest') {
            return;
          }
        }
        queue.push(value);
      }
    };

    // AIDEV-NOTE: notifications() always sets autoRecover internally so the
    // iterator can pause on unexpected disconnect and resume on reconnect.
    const key = this.charKey(service, characteristic);
    this.addToRecoveryRegistry(key, service, characteristic, callback);

    const { unsubscribe: _unsubscribe, release, ready } = this.registerNotificationConsumer(service, characteristic, callback);
    try {
      await ready;
    } catch (error) {
      await release();
      this.removeFromRecoveryRegistry(key, callback);
      throw error;
    }

    try {
      while (!state.done) {
        if (state.failure) throw state.failure;

        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          const result = await new Promise<IteratorResult<DataView>>((resolve, reject) => {
            state.resolve = resolve;
            state.reject = reject;
          });
          if (result.done) {
            // AIDEV-NOTE: On unexpected disconnect, the reconciliation loop will
            // clear notificationStates but recoveryRegistry survives. If a
            // reconnectGate exists and disconnect was not intentional, we pause
            // the iterator and wait for reconnect rather than terminating.
            const gate = this.deps.getReconnectGate();
            if (gate && !this.deps.isIntentionalDisconnect()) {
              await gate.promise;
              if (this.deps.isIntentionalDisconnect()) return;
              // After reconnect, recoverSubscriptions() already re-registered
              // our callback. Continue the loop to yield new values.
              continue;
            }
            return;
          }
          yield result.value;
        }
      }
    } finally {
      const pending = state.resolve;
      state.resolve = null;
      state.reject = null;
      state.done = true;
      await release();
      this.removeFromRecoveryRegistry(key, callback);
      if (pending) pending({ value: undefined as any, done: true });
    }
  }

  private handleNotification = (event: Event): void => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    const value = char.value;
    if (!value) return;

    // Dispatch to all subscribers for this characteristic
    for (const [key, notificationState] of this.notificationStates) {
      const cached = notificationState.characteristic ?? this.deps.charCache.get(key);
      if (cached === char) {
        const [service, characteristic] = key.split(':');
        for (const cb of notificationState.callbacks) {
          try {
            cb(value);
          } catch (error) {
            this.deps.emitError(BeacioError.from(error), {
              operation: 'device.notification-callback',
              service,
              characteristic,
            });
          }
        }
        break;
      }
    }
  };

  // Detach every native listener, stop active notifications, and clear runtime
  // notificationStates. `operation` distinguishes the caller in error context.
  private teardownSubscriptions(operation: string): void {
    for (const notificationState of this.notificationStates.values()) {
      this.detachNotificationListener(notificationState);
      if (notificationState.nativeActive) {
        void this.stopNotificationsSafely(notificationState.characteristic, {
          operation,
        });
      }
    }
    this.notificationStates.clear();
  }

  cleanupSubscriptions(): void {
    this.teardownSubscriptions('notification.cleanup');
  }

  // AIDEV-NOTE: suspendSubscriptions detaches listeners and clears runtime
  // notificationStates but preserves recoveryRegistry so subscriptions can be
  // rebuilt on reconnect.
  suspendSubscriptions(): void {
    this.teardownSubscriptions('notification.suspend');
  }

  async recoverSubscriptions(): Promise<void> {
    const entries = [...this.deps.recoveryRegistry.entries()];
    for (const [key, entry] of entries) {
      try {
        for (const callback of entry.callbacks) {
          const { ready } = this.registerNotificationConsumer(entry.service, entry.characteristic, callback);
          await ready;
        }
      } catch (error) {
        // Characteristic may no longer exist after firmware update or
        // service change — remove the stale entry from the registry.
        this.deps.recoveryRegistry.delete(key);
        const recoveredError = BeacioError.from(error);
        this.deps.emitSubscriptionLost({
          service: entry.service,
          characteristic: entry.characteristic,
          error: recoveredError,
        });
        this.deps.emitError(recoveredError, {
          operation: 'notification.recover',
          service: entry.service,
          characteristic: entry.characteristic,
        });
      }
    }
  }

  // AIDEV-NOTE: Keep one serialized notification lifecycle per characteristic so
  // subscribe() and notifications() cannot diverge during async start/stop races.
  private registerNotificationConsumer(
    service: string,
    characteristic: string,
    callback: NotificationCallback,
  ): { unsubscribe: () => void; release: () => Promise<void>; ready: Promise<void> } {
    const charKey = this.charKey(service, characteristic);
    let notificationState = this.notificationStates.get(charKey);
    if (!notificationState) {
      notificationState = {
        callbacks: new Set(),
        characteristic: null,
        listenerAttached: false,
        nativeActive: false,
        reconcilePromise: null,
      };
      this.notificationStates.set(charKey, notificationState);
    }

    notificationState.callbacks.add(callback);

    const release = (): Promise<void> => {
      const currentState = this.notificationStates.get(charKey);
      if (!currentState?.callbacks.has(callback)) return Promise.resolve();

      currentState.callbacks.delete(callback);
      return this.syncNotificationState(charKey, service, characteristic);
    };

    return {
      unsubscribe: () => { void release(); },
      release,
      ready: this.syncNotificationState(charKey, service, characteristic),
    };
  }

  private syncNotificationState(serviceKey: string, service: string, characteristic: string): Promise<void> {
    const notificationState = this.notificationStates.get(serviceKey);
    if (!notificationState) return Promise.resolve();

    const previous = notificationState.reconcilePromise ?? Promise.resolve();
    const next = previous.catch((error) => {
      this.deps.emitError(BeacioError.from(error), {
        operation: 'notification.reconcile',
        service,
        characteristic,
      });
    }).then(async () => {
      while (true) {
        const currentState = this.notificationStates.get(serviceKey);
        if (currentState !== notificationState) {
          await this.deactivateNotificationState(notificationState);
          return;
        }

        if (notificationState.callbacks.size === 0) {
          this.detachNotificationListener(notificationState);

          if (notificationState.nativeActive) {
            notificationState.nativeActive = false;
            await this.stopNotificationsSafely(notificationState.characteristic, {
              operation: 'notification.stop',
              service,
              characteristic,
            });
            continue;
          }

          this.deleteNotificationStateIfIdle(serviceKey, notificationState);
          return;
        }

        const char = notificationState.characteristic ?? await this.deps.getCharacteristic(service, characteristic);
        notificationState.characteristic = char;

        // AIDEV-NOTE: Attach event listener BEFORE startNotifications() to avoid
        // losing notifications that arrive between the native subscribe completing
        // and the JS listener being attached. Safe because listener is a no-op if
        // notifications haven't started yet.
        if (!notificationState.listenerAttached) {
          char.addEventListener('characteristicvaluechanged', this.handleNotification);
          notificationState.listenerAttached = true;
        }

        if (!notificationState.nativeActive) {
          await char.startNotifications();
          notificationState.nativeActive = true;

          if (this.notificationStates.get(serviceKey) !== notificationState) {
            await this.deactivateNotificationState(notificationState);
            return;
          }

          if (notificationState.callbacks.size === 0) continue;
        }

        if (notificationState.callbacks.size === 0) continue;
        return;
      }
    });

    const settled = next.finally(() => {
      if (notificationState.reconcilePromise === settled) {
        notificationState.reconcilePromise = null;
        if (this.notificationStates.get(serviceKey) === notificationState) {
          this.deleteNotificationStateIfIdle(serviceKey, notificationState);
        }
      }
    });

    notificationState.reconcilePromise = settled;
    return settled;
  }

  private async deactivateNotificationState(notificationState: NotificationState): Promise<void> {
    this.detachNotificationListener(notificationState);
    if (!notificationState.nativeActive) return;

    notificationState.nativeActive = false;
    await this.stopNotificationsSafely(notificationState.characteristic, {
      operation: 'notification.deactivate',
    });
  }

  private detachNotificationListener(notificationState: NotificationState): void {
    if (!notificationState.listenerAttached || !notificationState.characteristic) return;

    notificationState.characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
    notificationState.listenerAttached = false;
  }

  private deleteNotificationStateIfIdle(serviceKey: string, notificationState: NotificationState): void {
    if (this.notificationStates.get(serviceKey) !== notificationState) return;
    if (notificationState.callbacks.size > 0 || notificationState.nativeActive || notificationState.reconcilePromise) return;
    this.notificationStates.delete(serviceKey);
  }

  private validateMaxQueueSize(maxQueueSize: number): number {
    if (!Number.isInteger(maxQueueSize) || maxQueueSize <= 0) {
      throw new BeacioError('INVALID_PARAMETER', `Invalid maxQueueSize: ${maxQueueSize}. Must be a positive integer.`);
    }
    return maxQueueSize;
  }

  private async stopNotificationsSafely(
    characteristic: BluetoothRemoteGATTCharacteristic | null,
    context: DeviceErrorContext,
  ): Promise<void> {
    if (!characteristic) return;
    try {
      await characteristic.stopNotifications();
    } catch (error) {
      this.deps.emitError(BeacioError.from(error), context);
    }
  }

  private charKey(service: string, characteristic: string): string {
    return `${resolveUUID(service)}:${resolveUUID(characteristic)}`;
  }

  /**
   * Register a callback in the auto-recovery registry under `key`, creating the
   * entry if absent. Used so subscriptions can be re-established after reconnect.
   */
  private addToRecoveryRegistry(
    key: string,
    service: string,
    characteristic: string,
    callback: NotificationCallback,
  ): void {
    let entry = this.deps.recoveryRegistry.get(key);
    if (!entry) {
      entry = { service, characteristic, callbacks: new Set() };
      this.deps.recoveryRegistry.set(key, entry);
    }
    entry.callbacks.add(callback);
  }

  /**
   * Remove a callback from the auto-recovery registry entry at `key`, deleting
   * the entry entirely once its last callback is removed.
   */
  private removeFromRecoveryRegistry(key: string, callback: NotificationCallback): void {
    const entry = this.deps.recoveryRegistry.get(key);
    if (entry) {
      entry.callbacks.delete(callback);
      if (entry.callbacks.size === 0) this.deps.recoveryRegistry.delete(key);
    }
  }
}
