import assert from "node:assert/strict";
import test from "node:test";
import { checkMicrophone } from "../src/lib/microphone-check";

function setup(amplitude = 0) {
  let stopped = 0;
  let closed = 0;
  const track = { label: "Test input", stop() { stopped++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  class Context {
    resume = async () => {};
    close = async () => { closed++; };
    createMediaStreamSource = () => ({ connect() {} });
    createAnalyser = () => ({ fftSize: 2048, getFloatTimeDomainData(data: Float32Array) { data.fill(amplitude); } });
  }
  const statuses: string[] = [];
  const options = { AudioContext: Context as unknown as typeof AudioContext,
    mediaDevices: { getUserMedia: async () => stream }, onStatus: (text: string) => statuses.push(text) };
  return { options, statuses, stream, stopped: () => stopped, closed: () => closed };
}

test("microphone check distinguishes sound from silence and closes resources", async context => {
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  for (const amplitude of [0, 0.02]) {
    const fixture = setup(amplitude);
    checkMicrophone(fixture.options);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    context.mock.timers.tick(50);
    context.mock.timers.tick(5_000);
    assert.match(fixture.statuses.at(-1)!, amplitude ? /Audio detected.*Test input/ : /No usable audio detected.*Test input/);
    assert.equal(fixture.stopped(), 1);
    assert.equal(fixture.closed(), 1);
  }
});

test("permission failure is safe and closes the audio context", async () => {
  const fixture = setup();
  fixture.options.mediaDevices.getUserMedia = async () => { throw new DOMException("private provider text", "NotAllowedError"); };
  checkMicrophone(fixture.options);
  await Promise.resolve(); await Promise.resolve();
  assert.match(fixture.statuses.at(-1)!, /permission was denied/);
  assert.doesNotMatch(fixture.statuses.at(-1)!, /private provider text/);
  assert.equal(fixture.closed(), 1);
});

test("Stop suppresses late permission results and releases the arriving stream", async () => {
  const fixture = setup();
  let resolve!: (stream: MediaStream) => void;
  fixture.options.mediaDevices.getUserMedia = () => new Promise<MediaStream>(done => { resolve = done; });
  const check = checkMicrophone(fixture.options);
  check.stop();
  resolve(fixture.stream);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(fixture.statuses.length, 1);
  assert.equal(fixture.stopped(), 1);
  assert.equal(fixture.closed(), 1);
});
