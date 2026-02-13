// 小規模プロトタイプ用のメトロノーム実装
// Web Audio API を使い、簡易的に強拍/弱拍の短いクリックを鳴らす。
export class Metronome {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;
  private lookahead = 25; // ms
  private scheduleAheadTime = 0.1; // seconds
  private intervalId: number | null = null;
  private nextNoteTime = 0; // seconds (AudioContext.currentTime)
  private secondsPerBeat = 60 / 120; // default 120 BPM
  private beatIndex = 0;
  private beatsPerMeasure = 4;

  constructor() {}

  private ensureAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 0.5;
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  setBpm(bpm: number) {
    console.debug("Metronome.setBpm", bpm);
    if (bpm <= 0) return;
    this.secondsPerBeat = 60 / bpm;
  }

  setBeatsPerMeasure(beats: number) {
    console.debug("Metronome.setBeatsPerMeasure", beats);
    if (beats >= 1) this.beatsPerMeasure = Math.max(1, Math.floor(beats));
  }

  setVolume(v: number) {
    console.debug("Metronome.setVolume", v);
    this.ensureAudio();
    if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, v));
  }

  start() {
    console.debug("Metronome.start");
    this.ensureAudio();
    if (!this.audioCtx || !this.gainNode) return;
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    if (this.isRunning) return;
    this.isRunning = true;
    this.nextNoteTime = this.audioCtx.currentTime;
    this.beatIndex = 0;
    this.intervalId = window.setInterval(() => this.scheduler(), this.lookahead);
  }

  /**
   * 再生ヘッド位置に合わせて位相を揃えて開始する。
   * @param offsetIntoBeatSeconds  現在の小節内での拍の経過秒数（ビート内の経過秒）
   * @param secondsPerBeat ビート1つの長さ（秒）
   * @param initialBeatIndex 現在のビートインデックス（小節内）
   */
  startAligned(
    offsetIntoBeatSeconds: number,
    secondsPerBeat: number,
    initialBeatIndex: number,
    beatsPerMeasure?: number,
  ) {
    console.debug("Metronome.startAligned", { offsetIntoBeatSeconds, secondsPerBeat, initialBeatIndex });
    this.ensureAudio();
    if (!this.audioCtx || !this.gainNode) return;
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    if (this.isRunning) this.stop();
    this.secondsPerBeat = secondsPerBeat;
    if (beatsPerMeasure != null) this.beatsPerMeasure = beatsPerMeasure;
    // 次のノート時刻を現在時刻から計算
    const remainder = offsetIntoBeatSeconds % secondsPerBeat;
    const timeToNextBeat = remainder === 0 ? 0 : secondsPerBeat - remainder;
    this.nextNoteTime = this.audioCtx.currentTime + timeToNextBeat;
    // Compute upcoming beat index within the measure.
    const normalizedInitial =
      ((Math.floor(initialBeatIndex) % this.beatsPerMeasure) + this.beatsPerMeasure) % this.beatsPerMeasure;
    // If next note is immediate (on the beat), schedule that beat. Otherwise schedule the following beat.
    if (timeToNextBeat === 0) {
      this.beatIndex = normalizedInitial;
    } else {
      this.beatIndex = (normalizedInitial + 1) % this.beatsPerMeasure;
    }
    this.isRunning = true;
    this.intervalId = window.setInterval(() => this.scheduler(), this.lookahead);
  }

  stop() {
    console.debug("Metronome.stop");
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private scheduler() {
    if (!this.audioCtx) return;
    // debug
    // console.debug("Metronome.scheduler currentTime", this.audioCtx.currentTime, "nextNoteTime", this.nextNoteTime);
    while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
      const isAccent = this.beatIndex % this.beatsPerMeasure === 0;
      // debug
      console.debug("Metronome.schedule", { time: this.nextNoteTime, accent: isAccent, beatIndex: this.beatIndex });
      this.scheduleClick(this.nextNoteTime, isAccent);
      this.nextNoteTime += this.secondsPerBeat;
      this.beatIndex = (this.beatIndex + 1) % this.beatsPerMeasure;
    }
  }

  private scheduleClick(time: number, accent: boolean) {
    if (!this.audioCtx || !this.gainNode) return;
    console.debug("Metronome.scheduleClick", { time, accent, currentTime: this.audioCtx.currentTime });
    const osc = this.audioCtx.createOscillator();
    const env = this.audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = accent ? 1200 : 800;
    env.gain.value = 1;
    osc.connect(env);
    env.connect(this.gainNode);

    const duration = 0.03; // 30ms
    // Envelope
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(1, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // デバッグ用: 即時に単発クリックを鳴らす
  clickOnce() {
    this.ensureAudio();
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime + 0.01;
    console.debug("Metronome.clickOnce", { time: t });
    this.scheduleClick(t, true);
  }
}

// シングルトンとして簡易利用したい場合はこちらを使う
export const globalMetronome = new Metronome();
