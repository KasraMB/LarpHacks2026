/** Measures the default microphone locally. Never records, plays, or uploads audio. */
export function checkMicrophone(options: {
  mediaDevices: Pick<MediaDevices, "getUserMedia">;
  AudioContext: typeof AudioContext;
  onStatus(message: string): void;
}) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let sample: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearInterval(sample);
    clearTimeout(deadline);
    stream?.getTracks().forEach(track => track.stop());
    if (context) void context.close().catch(() => {});
  };
  const finish = (message: string) => {
    if (stopped) return;
    stop();
    options.onStatus(message);
  };
  options.onStatus("Allow microphone access, then speak for five seconds. Audio stays on this device.");
  deadline = setTimeout(() => finish("Microphone check timed out. Check Chrome site permissions and your system microphone settings."), 15_000);
  void (async () => {
    try {
      // Create/resume inside the click gesture, before permission is awaited.
      context = new options.AudioContext();
      const resumed = context.resume();
      void resumed.catch(() => {});
      stream = await options.mediaDevices.getUserMedia({ audio: true });
      if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      await resumed;
      if (stopped) return;
      const input = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      input.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const device = stream.getAudioTracks()[0]?.label || "default microphone";
      options.onStatus(`Checking ${device}. Speak now; audio stays on this device.`);
      let peak = 0;
      sample = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        peak = Math.max(peak, rms);
      }, 50);
      clearTimeout(deadline);
      deadline = setTimeout(() => finish(peak >= 0.005
        ? `Audio detected from ${device}. If Live transcript stays empty, browser speech recognition is failing; microphone access works.`
        : `No usable audio detected from ${device}. Check mute, input volume, and Chrome Settings > Privacy and security > Site settings > Microphone to select your microphone.`), 5_000);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      finish(name === "NotAllowedError"
        ? "Microphone permission was denied. Allow this site in Chrome and your system microphone privacy settings."
        : name === "NotFoundError"
          ? "No microphone was found. Connect or enable a microphone and try again."
          : "Chrome could not open the microphone. Check whether another app is using it and check your system input settings.");
    }
  })();
  return { stop };
}
