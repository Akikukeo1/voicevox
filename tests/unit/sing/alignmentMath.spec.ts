import { describe, it, expect } from "vitest";
import { DEFAULT_TPQN } from "@/sing/domain";
import {
  ticksToMeasuresBeats,
  getTimeSignaturePositions,
  getBeatDuration,
  tickToSecond,
} from "@/sing/music";

import type { TimeSignature, Tempo } from "@/domain/project/type";

describe("alignment math for metronome", () => {
  const tpqn = DEFAULT_TPQN;
  const tempos: Tempo[] = [{ position: 0, bpm: 120 }];

  it("computes secondsPerBeat and offset at measure start correctly (4/4, 120bpm)", () => {
    const timeSignatures: TimeSignature[] = [
      { measureNumber: 1, beats: 4, beatType: 4 },
    ];

    const tsPositions = getTimeSignaturePositions(timeSignatures, tpqn);
    const timeSignaturesWithPos = timeSignatures.map((v, i) => ({
      ...v,
      position: tsPositions[i],
    }));

    const currentTick = 0;
    const mb = ticksToMeasuresBeats(currentTick, timeSignaturesWithPos, tpqn);

    // beat duration ticks for 4/4
    const beatDurationTicks = getBeatDuration(timeSignatures[0].beatType, tpqn);
    const secondsPerBeat =
      tickToSecond(currentTick + beatDurationTicks, tempos, tpqn) -
      tickToSecond(currentTick, tempos, tpqn);

    expect(beatDurationTicks).toBe(tpqn); // (tpqn*4)/4
    expect(secondsPerBeat).toBeCloseTo(0.5, 6); // 120bpm -> 0.5s per beat
    expect(mb.beats).toBe(1);

    const offsetIntoBeatSeconds =
      (mb.beats - Math.floor(mb.beats)) * secondsPerBeat;
    const initialBeatIndex = Math.max(0, Math.floor(mb.beats) - 1);

    expect(offsetIntoBeatSeconds).toBeCloseTo(0, 6);
    expect(initialBeatIndex).toBe(0);
  });

  it("computes offset when playhead is inside a beat", () => {
    const timeSignatures: TimeSignature[] = [
      { measureNumber: 1, beats: 4, beatType: 4 },
    ];

    const tsPositions = getTimeSignaturePositions(timeSignatures, tpqn);
    const timeSignaturesWithPos = timeSignatures.map((v, i) => ({
      ...v,
      position: tsPositions[i],
    }));

    // put playhead 120 ticks into the measure (120 = 0.25 beat at tpqn=480)
    const currentTick = 120;
    const mb = ticksToMeasuresBeats(currentTick, timeSignaturesWithPos, tpqn);

    const beatDurationTicks = getBeatDuration(timeSignatures[0].beatType, tpqn);
    const secondsPerBeat =
      tickToSecond(currentTick + beatDurationTicks, tempos, tpqn) -
      tickToSecond(currentTick, tempos, tpqn);

    expect(mb.beats).toBeCloseTo(1 + 120 / beatDurationTicks, 6);

    const offsetIntoBeatSeconds =
      (mb.beats - Math.floor(mb.beats)) * secondsPerBeat;
    // 0.25 of a beat * 0.5s per beat = 0.125s
    expect(offsetIntoBeatSeconds).toBeCloseTo(0.125, 6);
  });
});
