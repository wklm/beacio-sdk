import { describe, expect, it, jest } from '@jest/globals';
import { NordicUARTProfile } from '../../src/profiles/nordic-uart';
import type { BeacioDevice, WriteFragmentedResult, WriteLimits } from '../../src/index';

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // host -> device (write)
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // device -> host (notify)

// Descriptors / characteristics the profile must NEVER touch directly.
// The native layer owns notification enablement (startNotifications covers
// both CCCD 0x2902 notify and SCCD 0x2903 indicate). A W3C-pure profile
// must never write these handles itself.
const FORBIDDEN_HANDLES = [
  '0x2902',
  '2902',
  '0x2903',
  '2903',
  '0x2A25',
  '2a25',
  '0x2A02',
  '0x2A03',
];

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

interface MockDeviceOptions {
  writeLimits?: WriteLimits;
}

function createMockDevice(options: MockDeviceOptions = {}): BeacioDevice {
  const writeLimits: WriteLimits = options.writeLimits ?? {
    withResponse: 512,
    withoutResponse: 512,
    mtu: 247,
  };
  const device = {
    connect: jest.fn(async () => undefined),
    read: jest.fn(async () => makeDataView([])),
    write: jest.fn(async () => undefined),
    writeWithoutResponse: jest.fn(async () => undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    getWriteLimits: jest.fn(async () => writeLimits),
    getMtu: jest.fn(async () => writeLimits.mtu),
  } as Record<string, unknown>;
  // send() now delegates fragmentation to device.writeFragmented (the core
  // write-chunker) instead of a hand-rolled per-chunk writeWithoutResponse loop.
  // The mock models writeFragmented faithfully: it clamps the without-response
  // limit to a positive stride (mirroring the branded ChunkSize smart-ctor) and
  // fans the payload out to writeWithoutResponse per chunk — so every existing
  // per-chunk assertion (counts, byte slices, order, zero-stride regression,
  // empty=no-write) still exercises the real byte-level behavior end to end.
  device.writeFragmented = jest.fn(
    async (service: string, characteristic: string, value: BufferSource): Promise<WriteFragmentedResult> => {
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const reported = writeLimits.withoutResponse;
      const step = Number.isInteger(reported) && (reported as number) > 0 ? (reported as number) : 20;
      let bytesWritten = 0;
      let chunkCount = 0;
      for (let offset = 0; offset < bytes.byteLength; offset += step) {
        const chunk = new Uint8Array(bytes.subarray(offset, offset + step));
        await (device.writeWithoutResponse as jest.Mock)(service, characteristic, chunk);
        bytesWritten += chunk.byteLength;
        chunkCount += 1;
      }
      return { bytesWritten, totalBytes: bytes.byteLength, chunkSize: step, chunkCount, retryCount: 0 };
    },
  );
  return device as unknown as BeacioDevice;
}

/** Collect every (service, characteristic) pair passed to any write/subscribe call. */
function collectHandleCalls(device: BeacioDevice): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  for (const fn of [device.write, device.writeWithoutResponse, device.writeFragmented, device.subscribe]) {
    for (const call of (fn as jest.Mock).mock.calls) {
      calls.push([call[0] as string, call[1] as string]);
    }
  }
  return calls;
}

describe('NordicUARTProfile', () => {
  describe('connect', () => {
    it('delegates connect to device', async () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      await nus.connect();
      expect(device.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('onReceive', () => {
    it('subscribes to the TX (0x...0003 notify) characteristic via device.subscribe', () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      expect(device.subscribe).toHaveBeenCalledWith(
        NUS_SERVICE,
        NUS_TX,
        expect.any(Function),
      );
    });

    it('subscribes to TX, NOT the RX write characteristic (no swap)', () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      const [, characteristic] = (device.subscribe as jest.Mock).mock.calls[0];
      expect(characteristic).toBe(NUS_TX);
      expect(characteristic).not.toBe(NUS_RX);
    });

    it('forwards the golden notification DataView to the consumer callback', () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      const received: DataView[] = [];
      nus.onReceive((chunk: DataView) => received.push(chunk));

      const registeredCb = (device.subscribe as jest.Mock).mock.calls[0][2] as (
        dv: DataView,
      ) => void;
      const golden = makeDataView([0x68, 0x69]); // "hi"
      registeredCb(golden);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(golden);
      expect(received[0].getUint8(0)).toBe(0x68);
      expect(received[0].getUint8(1)).toBe(0x69);
    });

    it('returns a callable unsubscribe function', () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      const unsubscribe = nus.onReceive(jest.fn());
      expect(typeof unsubscribe).toBe('function');
    });

    it('NEVER writes a CCCD/SCCD descriptor to enable notifications', () => {
      const device = createMockDevice();
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      // Enabling notifications must go through device.subscribe ONLY.
      expect(device.write).not.toHaveBeenCalled();
      expect(device.writeWithoutResponse).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('writes a short payload via writeWithoutResponse to the RX (0x...0002 write) characteristic', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      await nus.send(new Uint8Array([1, 2, 3]));

      expect(device.writeWithoutResponse).toHaveBeenCalledTimes(1);
      const [service, characteristic] = (device.writeWithoutResponse as jest.Mock).mock.calls[0];
      expect(service).toBe(NUS_SERVICE);
      expect(characteristic).toBe(NUS_RX);
    });

    it('prefers write-without-response and never uses write-with-response', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      await nus.send(new Uint8Array([9, 9, 9]));
      expect(device.write).not.toHaveBeenCalled();
    });

    it('chunks a payload larger than the withoutResponse limit (ceil(payload/max) writes)', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      // 50 bytes at max 20 => ceil(50/20) = 3 chunks (20, 20, 10)
      const payload = new Uint8Array(50).map((_, i) => i & 0xff);
      await nus.send(payload);

      expect(device.writeWithoutResponse).toHaveBeenCalledTimes(3);
      const calls = (device.writeWithoutResponse as jest.Mock).mock.calls;
      expect((calls[0][2] as Uint8Array).byteLength).toBe(20);
      expect((calls[1][2] as Uint8Array).byteLength).toBe(20);
      expect((calls[2][2] as Uint8Array).byteLength).toBe(10);
    });

    it('writes the correct per-chunk byte slices in order', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 4, mtu: 7 },
      });
      const nus = new NordicUARTProfile(device);
      const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      await nus.send(payload);

      const calls = (device.writeWithoutResponse as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3); // 4 + 4 + 1
      expect(Array.from(calls[0][2] as Uint8Array)).toEqual([0, 1, 2, 3]);
      expect(Array.from(calls[1][2] as Uint8Array)).toEqual([4, 5, 6, 7]);
      expect(Array.from(calls[2][2] as Uint8Array)).toEqual([8]);
    });

    it('falls back to a 20-byte chunk size when withoutResponse limit is null', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: null, mtu: null },
      });
      const nus = new NordicUARTProfile(device);
      const payload = new Uint8Array(45); // ceil(45/20) = 3 chunks
      await nus.send(payload);
      expect(device.writeWithoutResponse).toHaveBeenCalledTimes(3);
      const calls = (device.writeWithoutResponse as jest.Mock).mock.calls;
      expect((calls[0][2] as Uint8Array).byteLength).toBe(20);
      expect((calls[1][2] as Uint8Array).byteLength).toBe(20);
      expect((calls[2][2] as Uint8Array).byteLength).toBe(5);
    });

    it('falls back to a positive chunk size when withoutResponse limit is 0 (no infinite loop)', async () => {
      // Regression: a transport that reports withoutResponse:0 (a real,
      // type-safe `number | null` value — see core WriteLimits) must NOT be
      // taken literally as the chunk stride. `?? DEFAULT_CHUNK_SIZE` only
      // catches null/undefined, so 0 survives -> max=0 -> `offset += 0` spins
      // forever. send() must RESOLVE and write the full payload in positive
      // chunks.
      //
      // The mock below installs a circuit-breaker: the correct implementation
      // delivers a 45-byte payload in a handful of positive-size writes, so a
      // 1000-call cap is never reached when fixed. Under the current infinite
      // loop the cap trips near-instantly and throws, so `await send()`
      // rejects -> a clean, fast test failure (no hung runner, no OOM crash).
      // The 2000ms per-test timeout is a secondary backstop.
      const MAX_CALLS = 1000;
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 0, mtu: null },
      });
      let callCount = 0;
      (device.writeWithoutResponse as jest.Mock).mockImplementation(async () => {
        callCount += 1;
        if (callCount > MAX_CALLS) {
          throw new Error(
            `writeWithoutResponse exceeded ${MAX_CALLS} calls — send() is not ` +
              `advancing its write offset (withoutResponse:0 chunk stride bug)`,
          );
        }
        return undefined;
      });

      const nus = new NordicUARTProfile(device);
      const payload = new Uint8Array(45).map((_, i) => i & 0xff);
      await nus.send(payload);

      // Must have written at least once and never with an empty chunk.
      const calls = (device.writeWithoutResponse as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      let total = 0;
      for (const call of calls) {
        const chunk = call[2] as Uint8Array;
        expect(chunk.byteLength).toBeGreaterThan(0);
        total += chunk.byteLength;
      }
      // The whole payload must be delivered, exactly once, byte-for-byte.
      expect(total).toBe(payload.byteLength);
      const written = new Uint8Array(total);
      let cursor = 0;
      for (const call of calls) {
        const chunk = call[2] as Uint8Array;
        written.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
      expect(Array.from(written)).toEqual(Array.from(payload));
    }, 2000);

    it('accepts a raw ArrayBuffer payload', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      const buffer = new Uint8Array([10, 20, 30]).buffer;
      await nus.send(buffer);
      expect(device.writeWithoutResponse).toHaveBeenCalledTimes(1);
      expect(Array.from((device.writeWithoutResponse as jest.Mock).mock.calls[0][2] as Uint8Array)).toEqual([
        10, 20, 30,
      ]);
    });

    it('respects a typed-array byteOffset/byteLength view window', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      // View bytes [2,3,4] out of a 6-byte backing buffer.
      const backing = new Uint8Array([0, 1, 2, 3, 4, 5]);
      const view = new Uint8Array(backing.buffer, 2, 3);
      await nus.send(view);
      expect(device.writeWithoutResponse).toHaveBeenCalledTimes(1);
      expect(Array.from((device.writeWithoutResponse as jest.Mock).mock.calls[0][2] as Uint8Array)).toEqual([
        2, 3, 4,
      ]);
    });

    it('sends nothing for an empty payload', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      await nus.send(new Uint8Array([]));
      expect(device.writeWithoutResponse).not.toHaveBeenCalled();
    });
  });

  describe('W3C blocklist invariant', () => {
    it('never passes a forbidden descriptor/characteristic handle to any write or subscribe', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      await nus.send(new Uint8Array(40));

      const handles = collectHandleCalls(device).flat();
      for (const forbidden of FORBIDDEN_HANDLES) {
        expect(handles).not.toContain(forbidden);
      }
    });

    it('only ever touches the NUS service UUID', async () => {
      const device = createMockDevice({
        writeLimits: { withResponse: null, withoutResponse: 20, mtu: 23 },
      });
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      await nus.send(new Uint8Array(40));

      for (const [service] of collectHandleCalls(device)) {
        expect(service).toBe(NUS_SERVICE);
      }
    });
  });

  describe('stop / unsubscribe lifecycle', () => {
    it('invokes the registered unsubscribe exactly once on stop()', () => {
      const unsub = jest.fn();
      const device = {
        ...createMockDevice(),
        subscribe: jest.fn().mockReturnValue(unsub),
      } as unknown as BeacioDevice;
      const nus = new NordicUARTProfile(device);
      nus.onReceive(jest.fn());
      nus.stop();
      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe() returned by onReceive invokes the underlying unsubscribe once', () => {
      const unsub = jest.fn();
      const device = {
        ...createMockDevice(),
        subscribe: jest.fn().mockReturnValue(unsub),
      } as unknown as BeacioDevice;
      const nus = new NordicUARTProfile(device);
      const off = nus.onReceive(jest.fn());
      off();
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });
});
