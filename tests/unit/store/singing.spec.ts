import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { store } from "@/store";
import { singingStorePlugins } from "@/store/singing";
import type { State } from "@/store/type";
import { NoteId, TrackId } from "@/type/preload";
import { resetMockMode, uuid4 } from "@/helpers/random";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";
import { createDefaultTrack } from "@/sing/domain";

const initialState = cloneWithUnwrapProxy(store.state);
beforeEach(() => {
  store.replaceState(cloneWithUnwrapProxy(initialState));

  resetMockMode();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const createFakeStore = (state: State) => {
  let watchedCallback:
    | ((newValue: unknown, oldValue: unknown) => void)
    | undefined;
  const unwatch = vi.fn();

  const fakeStore = {
    state,
    dispatch: vi.fn(),
    watch(
      _getter: (state: State) => unknown,
      callback: (newValue: unknown, oldValue: unknown) => void,
      options?: { immediate?: boolean },
    ) {
      watchedCallback = callback;
      if (options?.immediate) {
        callback(_getter(fakeStore.state), undefined);
      }
      return unwatch;
    },
  };

  return {
    fakeStore,
    watchedCallback: () => watchedCallback,
    unwatch,
  };
};

test("トラックを挿入する", () => {
  const dummyTrack = createDefaultTrack();

  // 最後尾に追加
  // NOTE: 最初から１つトラックが登録されている
  const trackId1 = TrackId(uuid4());
  store.mutations.INSERT_TRACK({
    trackId: trackId1,
    track: dummyTrack,
    prevTrackId: undefined,
  });
  expect(store.state.trackOrder.slice(1)).toEqual([trackId1]);

  // 途中に追加
  const trackId2 = TrackId(uuid4());
  store.mutations.INSERT_TRACK({
    trackId: trackId2,
    track: dummyTrack,
    prevTrackId: store.state.trackOrder[0],
  });
  expect(store.state.trackOrder.slice(1)).toEqual([trackId2, trackId1]);
});

test("COMMAND_DUPLICATE_TRACK", async () => {
  const sourceTrackId = store.state.trackOrder[0];
  const sourceTrack = store.state.tracks.get(sourceTrackId);
  if (!sourceTrack) {
    throw new Error("sourceTrack not found");
  }

  // 直接代入ではなくミューテーション経由でセットアップ
  store.mutations.SET_TRACK_NAME({
    trackId: sourceTrackId,
    name: "Original Track",
  });
  store.mutations.COMMAND_SET_TRACK_MUTE({
    trackId: sourceTrackId,
    mute: true,
  });
  store.mutations.COMMAND_SET_TRACK_SOLO({
    trackId: sourceTrackId,
    solo: true,
  });
  const notes = [
    {
      id: NoteId(uuid4()),
      position: 0,
      duration: 480,
      noteNumber: 60,
      lyric: "test",
    },
  ];
  store.mutations.SET_NOTES({ trackId: sourceTrackId, notes });

  // ピッチ・音量編集データ
  const sourceTrackClone = cloneWithUnwrapProxy(sourceTrack);
  sourceTrackClone.pitchEditData = [440, 442, 440];
  sourceTrackClone.volumeEditData = [1.0, 1.2, 1.0];
  // 音素タイミング編集データ
  const noteId = notes[0].id;
  sourceTrackClone.phonemeTimingEditData.set(noteId, [
    { phonemeIndexInNote: 0, offsetSeconds: 0.1 },
  ]);
  store.mutations.SET_TRACK({
    trackId: sourceTrackId,
    track: sourceTrackClone,
  });
  const initialTrackIds = new Set(store.state.trackOrder);
  const sourceTrackIndex = store.state.trackOrder.indexOf(sourceTrackId);
  await store.actions.COMMAND_DUPLICATE_TRACK({ trackId: sourceTrackId });

  expect(store.state.trackOrder.length).toBe(initialTrackIds.size + 1);
  const newTrackId = store.state.trackOrder[sourceTrackIndex + 1];
  expect(initialTrackIds.has(newTrackId)).toBe(false);
  const newTrack = store.state.tracks.get(newTrackId);
  if (!newTrack) {
    throw new Error("newTrack not found");
  }

  expect(newTrack.name).toBe("Original Track - コピー");
  expect(newTrack.mute).toBe(true);
  expect(newTrack.solo).toBe(true);
  expect(newTrack.notes.length).toBe(1);
  expect(newTrack.notes[0].id).not.toBe(noteId);
  expect(newTrack.notes[0].lyric).toBe("test");
  expect(newTrack.pitchEditData).toEqual([440, 442, 440]);
  expect(newTrack.volumeEditData).toEqual([1.0, 1.2, 1.0]);

  // 音素タイミング編集データが新しいノートIDで引き継がれているか
  const newNoteId = newTrack.notes[0].id;
  expect(newTrack.phonemeTimingEditData.has(newNoteId)).toBe(true);
  expect(newTrack.phonemeTimingEditData.get(newNoteId)).toEqual([
    { phonemeIndexInNote: 0, offsetSeconds: 0.1 },
  ]);

  // 新しいトラックが選択されているか
  expect(store.getters.SELECTED_TRACK_ID).toBe(newTrackId);
});

test("RENDER is no-op when AudioContext is undefined", async () => {
  expect(window.AudioContext).toBeUndefined();
  // テスト環境では通常 AudioContext が undefined なので、呼び出してエラーが発生しないことを確認
  await store.actions.RENDER();
  await store.actions.STOP_RENDERING();
  expect(store.state.nowRendering).toBe(false);
});

test("SYNC_TRACKS_AND_TRACK_CHANNEL_STRIPS is no-op when AudioContext is undefined", async () => {
  expect(window.AudioContext).toBeUndefined();
  // AudioContext が無い環境でも呼び出して例外が出ないことを確認
  await expect(
    store.actions.SYNC_TRACKS_AND_TRACK_CHANNEL_STRIPS(),
  ).resolves.toBeUndefined();
});

test("再生デバイス同期プラグインは初回実行時に即時同期する", () => {
  const originalAudioContext = window.AudioContext;
  vi.stubGlobal("AudioContext", class {});

  const state = cloneWithUnwrapProxy(store.state);
  state.savingSetting.audioOutputDevice = "test-device";
  const { fakeStore } = createFakeStore(state);

  singingStorePlugins[0](fakeStore as never);

  expect(fakeStore.dispatch).toHaveBeenCalledWith(
    "APPLY_DEVICE_ID_TO_AUDIO_CONTEXT",
    { device: "test-device" },
  );

  if (originalAudioContext == undefined) {
    vi.unstubAllGlobals();
  } else {
    vi.stubGlobal("AudioContext", originalAudioContext);
  }
});

test("トラック数が1から2以上になったときだけサイドバーを開く", () => {
  const state = cloneWithUnwrapProxy(store.state);
  state.openedEditor = "song";
  const { fakeStore, watchedCallback } = createFakeStore(state);

  singingStorePlugins[1](fakeStore as never);

  expect(fakeStore.dispatch).not.toHaveBeenCalled();

  watchedCallback()?.(2, 1);
  expect(fakeStore.dispatch).toHaveBeenCalledTimes(1);
  expect(fakeStore.dispatch).toHaveBeenCalledWith("SET_SONG_SIDEBAR_OPEN", {
    isSongSidebarOpen: true,
  });

  watchedCallback()?.(3, 2);
  expect(fakeStore.dispatch).toHaveBeenCalledTimes(1);
});

test("SET_SONG_SIDEBAR_OPEN はオブジェクト payload で状態を更新する", async () => {
  store.mutations.SET_SONG_SIDEBAR_OPEN({ isSongSidebarOpen: false });

  await store.actions.SET_SONG_SIDEBAR_OPEN({ isSongSidebarOpen: true });

  expect(store.state.isSongSidebarOpen).toBe(true);
});

test("trackOrder.length と tracks.size は常に同期している", () => {
  // NOTE: autoOpenSongSidebarPlugin は trackOrder.length を監視しており、tracks.size ではなく trackOrder.length が正確である前提で動作している。
  // このテストでは、トラックの追加・削除時に両者が常に同期していることを確認する。
  const dummyTrack = createDefaultTrack();

  // 初期状態で同期
  expect(store.state.trackOrder.length).toBe(store.state.tracks.size);

  // トラック追加後も同期
  const trackId1 = TrackId(uuid4());
  store.mutations.INSERT_TRACK({
    trackId: trackId1,
    track: dummyTrack,
    prevTrackId: undefined,
  });
  expect(store.state.trackOrder.length).toBe(store.state.tracks.size);

  // 複数追加後も同期
  const trackId2 = TrackId(uuid4());
  store.mutations.INSERT_TRACK({
    trackId: trackId2,
    track: dummyTrack,
    prevTrackId: trackId1,
  });
  expect(store.state.trackOrder.length).toBe(store.state.tracks.size);
});
