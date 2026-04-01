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

  // 小節の開始（0 tick）のケースを検証する
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

    // 4/4 のときの1拍あたりの tick 数を取得
    const beatDurationTicks = getBeatDuration(timeSignatures[0].beatType, tpqn);
    // tick→秒変換を差分で取って1拍の秒数を求める
    const secondsPerBeat =
      tickToSecond(currentTick + beatDurationTicks, tempos, tpqn) -
      tickToSecond(currentTick, tempos, tpqn);

    expect(beatDurationTicks).toBe(tpqn); // (tpqn*4)/4
    expect(secondsPerBeat).toBeCloseTo(0.5, 6); // 120bpm -> 0.5s per beat
    expect(mb.beats).toBe(1);

    // 小節開始時は拍内オフセットが0であることを検証
    const offsetIntoBeatSeconds =
      (mb.beats - Math.floor(mb.beats)) * secondsPerBeat;
    const initialBeatIndex = Math.max(0, Math.floor(mb.beats) - 1);

    expect(offsetIntoBeatSeconds).toBeCloseTo(0, 6);
    expect(initialBeatIndex).toBe(0);
  });

  // 再生位置が拍の途中にある場合のオフセット計算を検証する
  it("computes offset when playhead is inside a beat", () => {
    const timeSignatures: TimeSignature[] = [
      { measureNumber: 1, beats: 4, beatType: 4 },
    ];

    const tsPositions = getTimeSignaturePositions(timeSignatures, tpqn);
    const timeSignaturesWithPos = timeSignatures.map((v, i) => ({
      ...v,
      position: tsPositions[i],
    }));

    // 再生位置を小節内で120tick進める (tpqn=480 の場合 0.25拍)
    const currentTick = 120;
    const mb = ticksToMeasuresBeats(currentTick, timeSignaturesWithPos, tpqn);

    const beatDurationTicks = getBeatDuration(timeSignatures[0].beatType, tpqn);
    // 1拍の秒数
    const secondsPerBeat =
      tickToSecond(currentTick + beatDurationTicks, tempos, tpqn) -
      tickToSecond(currentTick, tempos, tpqn);

    expect(mb.beats).toBeCloseTo(1 + 120 / beatDurationTicks, 6);

    const offsetIntoBeatSeconds =
      (mb.beats - Math.floor(mb.beats)) * secondsPerBeat;
    // 0.25拍 * 0.5s/拍 = 0.125s
    expect(offsetIntoBeatSeconds).toBeCloseTo(0.125, 6);
  });
});

// TODO: 異なる拍子(3/4 等)や途中でテンポが変化するケースも追加して網羅性を高める
