import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPracticeMachine, type PracticeMachine } from "./practiceMachine";
import { BrotherPP1Service } from "../services/BrotherPP1Service";
import { MachineStatus } from "../types/machine";
import { SewingMachineError } from "../utils/errorCodeHelpers";
import { encodeStitchesToPen } from "../formats/pen/encoder";

/**
 * These run the app's real Bluetooth service against the practice machine, so they check two things at
 * once: that the practice machine understands what the service sends, and that a design survives the trip.
 */

/** Two color blocks: a short line, a color change, another short line. */
function twoColorPattern() {
  const stitches: number[][] = [];
  for (let i = 0; i <= 40; i++) stitches.push([-200 + i * 10, -100, 0, 0]);
  for (let i = 0; i <= 40; i++) stitches.push([-200 + i * 10, 100, 0, 1]);
  const { penBytes, bounds } = encodeStitchesToPen(stitches);
  return { penData: new Uint8Array(penBytes), bounds };
}

describe("practice machine with the real Bluetooth service", () => {
  let machine: PracticeMachine;
  let service: BrotherPP1Service;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    machine = createPracticeMachine({
      speed: 4000,
      homeMs: 10,
      traceMs: 10,
      hangUpMs: 60000,
    });
    Object.defineProperty(navigator, "bluetooth", {
      value: machine.bluetooth,
      configurable: true,
    });
    service = new BrotherPP1Service();
  });

  afterEach(async () => {
    await service.disconnect();
    vi.restoreAllMocks();
  });

  const waitFor = async (status: MachineStatus) => {
    await vi.waitFor(() => expect(machine.snapshot().status).toBe(status), {
      timeout: 4000,
      interval: 20,
    });
  };

  it("starts out needing to be homed, and reports a real machine's details", async () => {
    await service.connect();
    const state = await service.getMachineState();
    expect(state.status).toBe(MachineStatus.Initial);
    expect(state.error).toBe(SewingMachineError.InitialHoopError);

    const info = await service.getMachineInfo();
    expect(info.serialNumber).toBe("PRACTICE1");
    expect(info.maxWidth).toBe(1000);
    expect(info.maxHeight).toBe(1000);

    machine.press("accept");
    await waitFor(MachineStatus.IDLE);
    expect((await service.getMachineState()).error).toBe(
      SewingMachineError.None,
    );
  });

  it("receives a design byte for byte, with its place in the hoop", async () => {
    await service.connect();
    machine.press("accept");
    await waitFor(MachineStatus.IDLE);

    const { penData, bounds } = twoColorPattern();
    const progress: number[] = [];
    const uuid = await service.uploadPattern(
      penData,
      (p) => progress.push(p),
      bounds,
      { x: 150, y: -50 },
    );

    expect(Array.from(machine.pattern() ?? [])).toEqual(Array.from(penData));
    expect(progress[progress.length - 1]).toBe(100);
    expect(await service.getPatternUUID()).toEqual(uuid);

    // layout: move x, move y (0.1 mm, little-endian), then 100 % size both ways
    const layout = machine.layout()!;
    const int16 = (o: number) =>
      new DataView(layout.buffer, layout.byteOffset).getInt16(o, true);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    expect(int16(0)).toBe(Math.round(150 - centerX));
    expect(int16(2)).toBe(Math.round(-50 - centerY));
    expect(int16(4)).toBe(100);
    expect(int16(6)).toBe(100);

    const info = await service.getPatternInfo();
    expect(info.totalStitches).toBe(penData.length / 4);
  });

  it("walks through trace, sewing, a thread break, a color change and the finish", async () => {
    await service.connect();
    machine.press("accept");
    await waitFor(MachineStatus.IDLE);
    const { penData, bounds } = twoColorPattern();
    await service.uploadPattern(penData, undefined, bounds);

    await service.startMaskTrace();
    expect(machine.snapshot().status).toBe(MachineStatus.MASK_TRACE_LOCK_WAIT);
    machine.press("accept");
    await waitFor(MachineStatus.MASK_TRACE_COMPLETE);

    await service.startSewing();
    expect(machine.snapshot().status).toBe(MachineStatus.SEWING_WAIT);
    machine.press("start");
    expect(machine.snapshot().status).toBe(MachineStatus.SEWING);

    machine.breakThread();
    const broken = await service.getMachineState();
    expect(broken.status).toBe(MachineStatus.SEWING_INTERRUPTION);
    expect(broken.error).toBe(SewingMachineError.UpperThreadError);

    // back up a few stitches, as the app does after a thread break, then carry on
    const at = (await service.getSewingProgress()).currentStitch;
    await service.setStitchIndex(Math.max(0, at - 6));
    expect((await service.getSewingProgress()).currentStitch).toBe(
      Math.max(0, at - 6),
    );
    await service.resumeSewing();
    machine.press("start");

    await waitFor(MachineStatus.COLOR_CHANGE_WAIT);
    machine.press("start");
    await waitFor(MachineStatus.SEWING_COMPLETE);
    expect((await service.getSewingProgress()).currentStitch).toBe(
      penData.length / 4,
    );
  });

  it("rejects a design that arrives damaged", async () => {
    await service.connect();
    machine.press("accept");
    await waitFor(MachineStatus.IDLE);

    const { penData } = twoColorPattern();
    const checksum = penData.reduce((sum, byte) => sum + byte, 0) & 0xffff;
    await service.sendDataInfo(penData.length, checksum);
    const damaged = penData.slice();
    damaged[8] ^= 0xff;
    await service.sendDataChunk(0, damaged);
    await expect(
      service.sendUUID(new Uint8Array(16).fill(7)),
    ).rejects.toThrow();
    expect(machine.pattern()).toBeNull();
  });
});

describe("practice machine on its own", () => {
  it("hangs up when it hears nothing for a while, like the real one", async () => {
    vi.useFakeTimers();
    try {
      const machine = createPracticeMachine({ hangUpMs: 3000 });
      const device = (await machine.bluetooth.requestDevice()) as {
        gatt: { connect: () => Promise<unknown> };
        addEventListener: (type: string, fn: () => void) => void;
      };
      const onGone = vi.fn();
      device.addEventListener("gattserverdisconnected", onGone);
      await device.gatt.connect();
      expect(machine.snapshot().connected).toBe(true);

      vi.advanceTimersByTime(2900);
      expect(onGone).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(onGone).toHaveBeenCalledTimes(1);
      expect(machine.snapshot().connected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
