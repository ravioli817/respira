/**
 * Practice machine: a pretend Skitch that answers the same Bluetooth commands as the real one, so the
 * whole send-and-stitch flow can be tried, and tested, with no machine in the room.
 *
 * How it moves from state to state is a best guess from this app's own code (types/machine.ts,
 * utils/machineStateHelpers.ts), not something recorded from a real machine. It is only ever used when the
 * page is opened with ?practice in the address.
 */
import { MachineStatus } from "../types/machine";
import { SewingMachineError } from "../utils/errorCodeHelpers";

const WRITE_CHAR_UUID = "a76eb9e2-f3ac-4990-84cf-3a94d2426b2b";

// Shaped like a real MACHINE_INFO reply (layout as parsed in services/BrotherPP1Service.ts), with a made-up
// serial number ("PRACTICE1") and address.
const MACHINE_INFO_REPLY = [
  0x00, 0x00, 0x00, 0x68, 0x50, 0x52, 0x41, 0x43, 0x54, 0x49, 0x43, 0x45, 0x31,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x64,
  0x00, 0x65, 0x02, 0x01, 0x01, 0xe8, 0x03, 0xe8, 0x03, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x38, 0x38, 0x38, 0x52, 0x30, 0x30, 0x35, 0x30, 0x32, 0x30, 0x31,
];
const SERVICE_COUNT_REPLY = [
  0x01, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
];

const PEN_COLOR_END = 0x03;
const PEN_DATA_END = 0x05;

export interface PracticeOptions {
  /** Needle points per second. The real machine manages about 7; the default is quicker so a try-out stays short. */
  speed?: number;
  /** The real machine hangs up after roughly three seconds without a command. */
  hangUpMs?: number;
  homeMs?: number;
  traceMs?: number;
}

export interface PracticeSnapshot {
  status: MachineStatus;
  error: number;
  connected: boolean;
  hasPattern: boolean;
  current: number;
  total: number;
}

export type PracticeButton = "accept" | "start";

export interface PracticeMachine {
  /** Stand-in for navigator.bluetooth. */
  bluetooth: { requestDevice: () => Promise<unknown> };
  /** Press one of the pretend machine's own buttons. */
  press: (button: PracticeButton) => void;
  breakThread: () => void;
  /** Lose the Bluetooth connection, as when the tablet wanders off. */
  drop: () => void;
  snapshot: () => PracticeSnapshot;
  watch: (listener: (snapshot: PracticeSnapshot) => void) => () => void;
  /** Everything written to the machine, for tests. */
  written: Uint8Array[];
  /** The design bytes the machine currently holds, for tests. */
  pattern: () => Uint8Array | null;
  /** The last layout payload received, for tests. */
  layout: () => Uint8Array | null;
}

export function createPracticeMachine(
  options: PracticeOptions = {},
): PracticeMachine {
  const speed = options.speed ?? 80;
  const hangUpMs = options.hangUpMs ?? 3500;
  const homeMs = options.homeMs ?? 1800;
  const traceMs = options.traceMs ?? 3500;

  let status: MachineStatus = MachineStatus.Initial;
  let error: number = SewingMachineError.InitialHoopError;
  let data: Uint8Array | null = null;
  let expectedLength = 0;
  let expectedSum = 0;
  let received = 0;
  let uuid: Uint8Array | null = null;
  let layout: Uint8Array | null = null;
  let current = 0;
  let total = 0;
  let reply: Uint8Array = new Uint8Array(0);
  let connected = false;
  let sewTimer: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const disconnectListeners: Array<(event: Event) => void> = [];
  const watchers = new Set<(snapshot: PracticeSnapshot) => void>();
  const written: Uint8Array[] = [];

  const snapshot = (): PracticeSnapshot => ({
    status,
    error,
    connected,
    hasPattern: data !== null && uuid !== null,
    current,
    total,
  });
  const changed = () => {
    const now = snapshot();
    watchers.forEach((listener) => listener(now));
  };
  const setStatus = (next: MachineStatus, nextError?: number) => {
    status = next;
    if (nextError !== undefined) error = nextError;
    changed();
  };
  const stopSewing = () => {
    if (sewTimer) clearInterval(sewTimer);
    sewTimer = null;
  };
  const sew = () => {
    stopSewing();
    setStatus(MachineStatus.SEWING, SewingMachineError.None);
    sewTimer = setInterval(() => {
      let steps = Math.max(1, Math.round(speed / 20));
      while (steps-- > 0 && status === MachineStatus.SEWING && data) {
        const flag = data[current * 4] & 0x07;
        current++;
        if (flag === PEN_DATA_END || current >= total) {
          stopSewing();
          setStatus(MachineStatus.SEWING_COMPLETE);
        } else if (flag === PEN_COLOR_END) {
          stopSewing();
          setStatus(MachineStatus.COLOR_CHANGE_WAIT);
        }
      }
      changed();
    }, 50);
  };

  const drop = () => {
    if (!connected) return;
    connected = false;
    if (idleTimer) clearTimeout(idleTimer);
    changed();
    const event = new Event("gattserverdisconnected");
    disconnectListeners.forEach((listener) => listener(event));
  };
  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(drop, hangUpMs);
  };

  const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
  const answer = (head: number[], body: number[]) => {
    reply = new Uint8Array([...head, ...body]);
  };

  const handle = (bytes: Uint8Array) => {
    const command = (bytes[0] << 8) | bytes[1];
    const payload = bytes.subarray(2);
    const head = [bytes[0], bytes[1]];
    touch();

    switch (command) {
      case 0x0000: // machine info
        reply = new Uint8Array(MACHINE_INFO_REPLY);
        break;
      case 0x0001: // machine state
        answer(head, [status, 0x00, error]);
        break;
      case 0x0100: // service count
        reply = new Uint8Array(SERVICE_COUNT_REPLY);
        break;
      case 0x0702: // which design is loaded
        answer(head, uuid ? Array.from(uuid) : new Array(16).fill(0xff));
        break;
      case 0x0708: // delete the design
        stopSewing();
        data = null;
        uuid = null;
        current = 0;
        total = 0;
        if (status !== MachineStatus.Initial) setStatus(MachineStatus.IDLE);
        answer(head, [0x00]);
        break;
      case 0x1200: // a design of this length and checksum is coming
        expectedLength =
          payload[1] |
          (payload[2] << 8) |
          (payload[3] << 16) |
          (payload[4] << 24);
        expectedSum = payload[5] | (payload[6] << 8);
        data = new Uint8Array(expectedLength);
        received = 0;
        uuid = null;
        setStatus(MachineStatus.SEWING_DATA_RECEIVE);
        answer(head, [payload[0] === 0x03 ? 0x00 : 0x01]);
        break;
      case 0x1201: {
        // one chunk: offset, bytes, checksum of the bytes
        const offset =
          payload[0] |
          (payload[1] << 8) |
          (payload[2] << 16) |
          (payload[3] << 24);
        const body = payload.subarray(4, payload.length - 1);
        const sum = body.reduce((acc, byte) => (acc + byte) & 0xff, 0);
        if (
          data &&
          sum === payload[payload.length - 1] &&
          offset + body.length <= expectedLength
        ) {
          data.set(body, offset);
          received += body.length;
        }
        break;
      }
      case 0x0705: // where the design sits in the hoop
        layout = new Uint8Array(payload);
        answer(head, [0x00]);
        break;
      case 0x070a: {
        // the design's id: the upload is complete
        const sum = data
          ? data.reduce((acc, byte) => (acc + byte) & 0xffff, 0)
          : -1;
        const ok =
          data !== null &&
          received === expectedLength &&
          sum === expectedSum &&
          expectedLength % 4 === 0;
        if (ok) {
          uuid = new Uint8Array(payload.subarray(0, 16));
          total = expectedLength / 4;
          current = 0;
        } else {
          data = null;
        }
        setStatus(MachineStatus.IDLE);
        answer(head, [ok ? 0x00 : 0x01]);
        break;
      }
      case 0x0706: // design summary
        answer(head, [
          ...(layout
            ? Array.from(layout.subarray(12, 20))
            : new Array(8).fill(0)),
          ...u16(Math.round(total / 6.7)),
          ...u16(total & 0xffff),
          ...u16(400),
        ]);
        break;
      case 0x0707: // progress
        answer(head, [...u16(current), 0, 0, ...u16(999), 0, 0, 0, 0]);
        break;
      case 0x0c02: // machine settings
        answer(head, [0x00, 0x00, 0x00, 0x00]);
        break;
      case 0x0704: // trace the outline
        if (
          data &&
          uuid &&
          (status === MachineStatus.IDLE ||
            status === MachineStatus.MASK_TRACE_COMPLETE ||
            status === MachineStatus.SEWING_WAIT)
        ) {
          setStatus(MachineStatus.MASK_TRACE_LOCK_WAIT);
        }
        answer(head, [0x00]);
        break;
      case 0x070e: // get ready to sew
        if (
          status === MachineStatus.MASK_TRACE_COMPLETE ||
          status === MachineStatus.PAUSE ||
          status === MachineStatus.SEWING_INTERRUPTION
        ) {
          setStatus(MachineStatus.SEWING_WAIT, SewingMachineError.None);
        }
        answer(head, [0x00]);
        break;
      case 0x0709: // move to a stitch
        current = Math.min(total, payload[0] | (payload[1] << 8));
        changed();
        answer(head, [0x00]);
        break;
      default:
        answer(head, [0x00]);
    }
  };

  const press = (button: PracticeButton) => {
    if (button === "accept") {
      if (status === MachineStatus.Initial) {
        setStatus(MachineStatus.HOOP_AVOIDANCEING, SewingMachineError.None);
        setTimeout(() => setStatus(MachineStatus.IDLE), homeMs);
      } else if (status === MachineStatus.MASK_TRACE_LOCK_WAIT) {
        setStatus(MachineStatus.MASK_TRACING);
        setTimeout(() => {
          if (status === MachineStatus.MASK_TRACING) {
            setStatus(MachineStatus.MASK_TRACE_COMPLETE);
          }
        }, traceMs);
      } else if (status === MachineStatus.SEWING_COMPLETE) {
        setStatus(MachineStatus.IDLE);
      }
    } else if (
      status === MachineStatus.SEWING_WAIT ||
      status === MachineStatus.COLOR_CHANGE_WAIT ||
      status === MachineStatus.SEWING_INTERRUPTION ||
      status === MachineStatus.PAUSE
    ) {
      sew();
    } else if (status === MachineStatus.SEWING) {
      stopSewing();
      setStatus(MachineStatus.SEWING_WAIT);
    }
  };

  const breakThread = () => {
    if (status !== MachineStatus.SEWING) return;
    stopSewing();
    setStatus(
      MachineStatus.SEWING_INTERRUPTION,
      SewingMachineError.UpperThreadError,
    );
  };

  const gone = () => Promise.reject(new Error("GATT Server is disconnected."));
  const writeCharacteristic = {
    writeValueWithResponse: (value: BufferSource) => {
      if (!connected) return gone();
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value.slice(0))
          : new Uint8Array(
              value.buffer.slice(
                value.byteOffset,
                value.byteOffset + value.byteLength,
              ),
            );
      written.push(bytes);
      handle(bytes);
      return Promise.resolve();
    },
  };
  const readCharacteristic = {
    readValue: () => {
      if (!connected) return gone();
      const copy = reply.slice();
      return Promise.resolve(new DataView(copy.buffer));
    },
  };
  const service = {
    getCharacteristic: (id: string) =>
      Promise.resolve(
        id === WRITE_CHAR_UUID ? writeCharacteristic : readCharacteristic,
      ),
  };
  const server = {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
      touch();
      changed();
      return Promise.resolve(server);
    },
    disconnect: drop,
    getPrimaryService: () => Promise.resolve(service),
  };
  const device = {
    name: "Practice Skitch",
    gatt: server,
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === "gattserverdisconnected") disconnectListeners.push(listener);
    },
  };

  return {
    bluetooth: { requestDevice: () => Promise.resolve(device) },
    press,
    breakThread,
    drop,
    snapshot,
    watch: (listener) => {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
    written,
    pattern: () => data,
    layout: () => layout,
  };
}

let installed: PracticeMachine | null = null;

/** True when the page was opened with ?practice in its address. */
export function practiceRequested(): boolean {
  return new URLSearchParams(window.location.search).has("practice");
}

/** Swaps the browser's Bluetooth for the practice machine. Call before the app starts. */
export function installPracticeMachine(): PracticeMachine {
  if (!installed) {
    installed = createPracticeMachine();
    Object.defineProperty(navigator, "bluetooth", {
      value: installed.bluetooth,
      configurable: true,
    });
  }
  return installed;
}

export function getPracticeMachine(): PracticeMachine | null {
  return installed;
}
