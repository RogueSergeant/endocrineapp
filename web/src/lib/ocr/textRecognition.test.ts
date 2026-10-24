import type { WorkerRequest, WorkerResponse } from "./protocol";

import type * as ClientModule from "./textRecognition";

type Client = typeof ClientModule;

/** Stand-in for the OCR worker: records requests, lets the test reply. */
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  sent: WorkerRequest[] = [];
  terminated = false;

  constructor() {
    super();
    FakeWorker.instances.push(this);
  }

  postMessage(msg: WorkerRequest) {
    this.sent.push(msg);
  }

  terminate() {
    this.terminated = true;
  }

  reply(msg: WorkerResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: msg }));
  }

  lastRecogniseId(): number {
    const req = [...this.sent].reverse().find((m) => m.type === "recognise");
    if (!req || req.type !== "recognise") throw new Error("no recognise request");
    return req.id;
  }
}

const bitmap = {} as ImageBitmap;
let client: Client;

beforeEach(async () => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.useFakeTimers();
  vi.resetModules();
  client = await import("./textRecognition");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const worker = (i = 0) => FakeWorker.instances[i]!;
const status = () => client.useOcrStatus.getState();

describe("preloadOcr", () => {
  it("starts one worker and sends init once while loading", () => {
    client.preloadOcr();
    client.preloadOcr();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker().sent).toEqual([{ type: "init" }]);
    expect(status().status).toBe("loading");
  });

  it("tracks progress and becomes ready", () => {
    client.preloadOcr();
    worker().reply({ type: "progress", loaded: 5, total: 10 });
    expect(status()).toMatchObject({ loaded: 5, total: 10, status: "loading" });
    worker().reply({ type: "ready" });
    expect(status().status).toBe("ready");
  });

  it("reports an init error and retries on the next call", () => {
    client.preloadOcr();
    worker().reply({ type: "init-error", message: "offline" });
    expect(status()).toMatchObject({ status: "error", error: "offline" });
    client.preloadOcr();
    expect(worker().sent).toEqual([{ type: "init" }, { type: "init" }]);
  });
});

describe("load watchdog", () => {
  it("errors and kills the worker when loading makes no progress", () => {
    client.preloadOcr();
    vi.advanceTimersByTime(client.LOAD_STALL_MS);
    expect(status().status).toBe("error");
    expect(status().error).toMatch(/stalled/);
    expect(worker().terminated).toBe(true);
  });

  it("is pushed back by every progress message", () => {
    client.preloadOcr();
    for (let i = 1; i <= 4; i++) {
      vi.advanceTimersByTime(client.LOAD_STALL_MS - 1000);
      worker().reply({ type: "progress", loaded: i, total: 10 });
    }
    expect(status().status).toBe("loading");
    vi.advanceTimersByTime(client.LOAD_STALL_MS);
    expect(status().status).toBe("error");
  });

  it("does not fire once the models are ready", () => {
    client.preloadOcr();
    worker().reply({ type: "ready" });
    vi.advanceTimersByTime(client.LOAD_STALL_MS * 2);
    expect(status().status).toBe("ready");
    expect(worker().terminated).toBe(false);
  });

  it("gives initialisation after the download its own, longer allowance", () => {
    client.preloadOcr();
    worker().reply({ type: "progress", loaded: 10, total: 10 });
    worker().reply({ type: "downloaded" });
    vi.advanceTimersByTime(client.INIT_TIMEOUT_MS - 1000);
    expect(status().status).toBe("loading");
    worker().reply({ type: "ready" });
    expect(status().status).toBe("ready");
    expect(worker().terminated).toBe(false);
  });

  it("gives up on an initialisation that never finishes, without blaming the network", () => {
    client.preloadOcr();
    worker().reply({ type: "downloaded" });
    vi.advanceTimersByTime(client.INIT_TIMEOUT_MS);
    expect(status().status).toBe("error");
    expect(status().error).toMatch(/took too long to start/);
    expect(worker().terminated).toBe(true);
  });

  it("lets a retry start a fresh worker after a stall", () => {
    client.preloadOcr();
    vi.advanceTimersByTime(client.LOAD_STALL_MS);
    client.preloadOcr();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(worker(1).sent).toEqual([{ type: "init" }]);
    expect(status().status).toBe("loading");
  });

  it("rejects a scan that is waiting for the models", async () => {
    const result = client.recogniseText(bitmap);
    const assertion = expect(result).rejects.toThrow(/stalled/);
    await vi.advanceTimersByTimeAsync(client.LOAD_STALL_MS);
    await assertion;
  });
});

describe("recogniseText", () => {
  it("waits for the models, then returns raw and cleaned text", async () => {
    const result = client.recogniseText(bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker().sent).toEqual([{ type: "init" }]);
    worker().reply({ type: "ready" });
    await vi.advanceTimersByTimeAsync(0);
    const id = worker().lastRecogniseId();
    worker().reply({
      type: "result",
      id,
      text: "Ingredients: Aqua, Glycerin",
      confidence: 0.99,
      angle: 0,
      spots: [],
      ms: 42,
    });
    const r = await result;
    expect(r.rawText).toBe("Ingredients: Aqua, Glycerin");
    expect(r.ms).toBe(42);
  });

  it("passes a recognition error through", async () => {
    client.preloadOcr();
    worker().reply({ type: "ready" });
    const result = client.recogniseText(bitmap);
    await vi.advanceTimersByTimeAsync(0);
    worker().reply({ type: "error", id: worker().lastRecogniseId(), message: "bad image" });
    await expect(result).rejects.toThrow("bad image");
  });

  it("times out a stuck recognition and resets the worker", async () => {
    client.preloadOcr();
    worker().reply({ type: "ready" });
    const result = client.recogniseText(bitmap);
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(client.OCR_TIMEOUT_MS);
    await assertion;
    expect(worker().terminated).toBe(true);
    expect(status().status).toBe("idle");
  });

  it("does not start the recognition timeout during a slow download", async () => {
    const result = client.recogniseText(bitmap);
    // Steady progress for longer than the recognition timeout.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(client.OCR_TIMEOUT_MS / 2);
      worker().reply({ type: "progress", loaded: i, total: 10 });
    }
    worker().reply({ type: "ready" });
    await vi.advanceTimersByTimeAsync(0);
    worker().reply({
      type: "result",
      id: worker().lastRecogniseId(),
      text: "Aqua",
      confidence: 1,
      angle: 0,
      spots: [],
      ms: 1,
    });
    await expect(result).resolves.toMatchObject({ rawText: "Aqua" });
  });
});
