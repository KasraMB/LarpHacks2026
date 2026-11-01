import assert from "node:assert/strict";
import test from "node:test";
import { createSpeechCapture, type Recognition } from "../src/lib/speech-capture";

class FakeRecognition implements Recognition {
  static instance: FakeRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: Recognition["onstart"] = null;
  onend: Recognition["onend"] = null;
  onerror: Recognition["onerror"] = null;
  onresult: Recognition["onresult"] = null;
  starts = 0;
  aborts = 0;
  constructor() { FakeRecognition.instance = this; }
  start() { this.starts++; this.onstart?.(); }
  abort() { this.aborts++; this.onend?.(); }
  result(values: string[], index = 0) {
    this.onresult?.({ resultIndex: index, results: values.map(transcript => [{ transcript }]) });
  }
}

function setup(initialTranscript?: string) {
  const transcripts: string[] = [];
  const statuses: string[] = [];
  const errors: string[] = [];
  const capture = createSpeechCapture({ Recognition: FakeRecognition, language: "en-US", initialTranscript,
    onTranscript: value => transcripts.push(value), onStatus: value => statuses.push(value), onError: value => errors.push(value) });
  return { capture, recognition: FakeRecognition.instance, transcripts, statuses, errors };
}

test("speech emits interim phrases and corrects them instead of duplicating them", () => {
  const { capture, recognition, transcripts, statuses } = setup();
  capture.start();
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, true);
  recognition.result(["What is a point"]);
  recognition.result(["What is a pointer"]);
  recognition.result(["What is a pointer", "in C++"], 1);
  assert.deepEqual(transcripts, ["What is a point", "What is a pointer", "What is a pointer in C++"]);
  assert.deepEqual(statuses, ["starting", "listening"]);
  capture.dispose();
});

test("natural browser end restarts and keeps bounded prior context", async () => {
  const { capture, recognition, transcripts } = setup("Earlier question");
  capture.start();
  recognition.result(["about pointers"]);
  recognition.onend?.();
  await new Promise(resolve => setTimeout(resolve, 330));
  assert.equal(recognition.starts, 2);
  recognition.result(["and memory"]);
  assert.equal(transcripts.at(-1), "Earlier question about pointers and memory");
  recognition.result(["x".repeat(3_000)]);
  assert.equal(transcripts.at(-1)?.length, 1_600);
  capture.dispose();
});

test("permission/network failures stop recognition with actionable safe errors", () => {
  for (const code of ["not-allowed", "network", "audio-capture", "service-not-allowed", "unknown secret provider text"]) {
    const { capture, recognition, errors, transcripts, statuses } = setup();
    capture.start();
    recognition.onerror?.({ error: code });
    assert.equal(statuses.at(-1), "stopped");
    assert.equal(errors.length, 1);
    assert.match(errors[0], /type.*below/i);
    assert.doesNotMatch(errors[0], /secret provider/);
    recognition.result(["late callback"]);
    assert.deepEqual(transcripts, []);
    capture.dispose();
  }
});

test("stop and dispose cancel restart and drop late callbacks", async () => {
  const { capture, recognition, transcripts } = setup();
  capture.start();
  recognition.onend?.();
  capture.stop();
  recognition.result(["late"]);
  await new Promise(resolve => setTimeout(resolve, 330));
  assert.equal(recognition.starts, 1);
  assert.deepEqual(transcripts, []);
  capture.dispose();
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.onend, null);
});

test("repeated empty recognition ends stop automatically instead of retrying forever", async () => {
  const { capture, recognition, errors } = setup();
  capture.start();
  for (let i = 0; i < 4; i++) {
    recognition.onerror?.({ error: "no-speech" });
    recognition.onend?.();
    if (i < 3) await new Promise(resolve => setTimeout(resolve, 330));
  }
  assert.equal(recognition.starts, 4);
  assert.match(errors[0], /No speech was detected/);
  capture.dispose();
});
