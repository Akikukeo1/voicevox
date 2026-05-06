import { expect, test, vi } from "vitest";
import { createAltPortNotificationWatcher } from "@/store/engine";
import { store } from "@/store";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";
import type { State } from "@/store/type";
import type { EngineId, EngineInfo } from "@/type/preload";

const createFakeStore = (state: State) => {
  let watchedGetter: ((state: State, getters: unknown) => unknown) | undefined;
  let watchedCallback:
    | ((newValue: unknown, oldValue: unknown) => void)
    | undefined;
  const unwatch = vi.fn();

  const fakeStore = {
    state,
    dispatch: vi.fn(),
    watch<T>(
      getter: (state: State, getters: unknown) => T,
      callback: (newValue: T, oldValue: T) => void,
    ) {
      watchedGetter = getter as (state: State, getters: unknown) => unknown;
      watchedCallback = callback as (
        newValue: unknown,
        oldValue: unknown,
      ) => void;
      return unwatch;
    },
  };

  return {
    fakeStore,
    watchedGetter: () => watchedGetter,
    watchedCallback: () => watchedCallback,
    unwatch,
  };
};

const createEngineInfo = (
  engineId: EngineId,
  name: string,
  defaultPort: string,
): EngineInfo => ({
  uuid: engineId,
  protocol: "http:",
  hostname: "localhost",
  defaultPort,
  pathname: "",
  name,
  version: "1.0.0",
  executionEnabled: true,
  executionFilePath: `${name}.exe`,
  executionArgs: [],
  type: "path",
  isDefault: false,
});

test("代替ポートがないエンジンがあっても他のエンジンの通知を止めない", () => {
  const engineId1 = "engine-a" as EngineId;
  const engineId2 = "engine-b" as EngineId;
  const state = cloneWithUnwrapProxy(store.state);
  state.altPortInfos = {
    [engineId2]: "12345",
  };
  state.isVuexReady = true;
  state.openedEditor = "talk";
  state.confirmedTips = {
    tweakableSliderByScroll: false,
    engineStartedOnAltPort: false,
    notifyOnGenerate: false,
  };
  state.engineIds = [engineId1, engineId2];
  state.engineInfos = {
    [engineId1]: createEngineInfo(engineId1, "エンジンA", "50021"),
    [engineId2]: createEngineInfo(engineId2, "エンジンB", "50022"),
  };

  const { fakeStore, watchedGetter, watchedCallback, unwatch } =
    createFakeStore(state);

  const stopWatching = createAltPortNotificationWatcher(fakeStore);
  expect(stopWatching).toBe(unwatch);
  expect(watchedGetter()?.(state, undefined)).toEqual([
    state.altPortInfos,
    state.isVuexReady,
    state.engineIds,
    state.engineInfos,
  ]);
  expect(fakeStore.dispatch).not.toHaveBeenCalled();

  watchedCallback()?.(undefined, undefined);

  expect(fakeStore.dispatch).toHaveBeenCalledTimes(1);
  expect(fakeStore.dispatch).toHaveBeenCalledWith(
    "SHOW_NOTIFY_AND_NOT_SHOW_AGAIN_BUTTON",
    {
      message:
        "50022番ポートが使用中であるため エンジンB は、12345番ポートで起動しました",
      icon: "compare_arrows",
      tipName: "engineStartedOnAltPort",
    },
  );
});

test("代替ポート通知は同じエンジンを重複通知しない", () => {
  const engineId1 = "engine-a" as EngineId;
  const engineId2 = "engine-b" as EngineId;
  const state = cloneWithUnwrapProxy(store.state);
  state.altPortInfos = {
    [engineId1]: "12345",
  };
  state.isVuexReady = true;
  state.openedEditor = "talk";
  state.confirmedTips = {
    tweakableSliderByScroll: false,
    engineStartedOnAltPort: false,
    notifyOnGenerate: false,
  };
  state.engineIds = [engineId1, engineId2];
  state.engineInfos = {
    [engineId1]: createEngineInfo(engineId1, "エンジンA", "50021"),
    [engineId2]: createEngineInfo(engineId2, "エンジンB", "50022"),
  };

  const { fakeStore, watchedCallback } = createFakeStore(state);
  createAltPortNotificationWatcher(fakeStore);

  watchedCallback()?.(undefined, undefined);
  expect(fakeStore.dispatch).toHaveBeenCalledTimes(1);
  expect(fakeStore.dispatch).toHaveBeenLastCalledWith(
    "SHOW_NOTIFY_AND_NOT_SHOW_AGAIN_BUTTON",
    {
      message:
        "50021番ポートが使用中であるため エンジンA は、12345番ポートで起動しました",
      icon: "compare_arrows",
      tipName: "engineStartedOnAltPort",
    },
  );

  state.altPortInfos = {
    [engineId1]: "12345",
    [engineId2]: "23456",
  };
  watchedCallback()?.(undefined, undefined);
  expect(fakeStore.dispatch).toHaveBeenCalledTimes(2);
  expect(fakeStore.dispatch).toHaveBeenLastCalledWith(
    "SHOW_NOTIFY_AND_NOT_SHOW_AGAIN_BUTTON",
    {
      message:
        "50022番ポートが使用中であるため エンジンB は、23456番ポートで起動しました",
      icon: "compare_arrows",
      tipName: "engineStartedOnAltPort",
    },
  );
});

test("エンジン情報がまだ無い場合は例外にせず次回へ持ち越す", () => {
  const engineId1 = "engine-a" as EngineId;
  const engineId2 = "engine-b" as EngineId;
  const state = cloneWithUnwrapProxy(store.state);
  state.altPortInfos = {
    [engineId1]: "12345",
    [engineId2]: "23456",
  };
  state.isVuexReady = true;
  state.openedEditor = "talk";
  state.confirmedTips = {
    tweakableSliderByScroll: false,
    engineStartedOnAltPort: false,
    notifyOnGenerate: false,
  };
  state.engineIds = [engineId1, engineId2];
  state.engineInfos = {
    [engineId1]: createEngineInfo(engineId1, "エンジンA", "50021"),
  };

  const { fakeStore, watchedCallback } = createFakeStore(state);
  createAltPortNotificationWatcher(fakeStore);

  expect(() => watchedCallback()?.(undefined, undefined)).not.toThrow();
  expect(fakeStore.dispatch).toHaveBeenCalledTimes(1);
  expect(fakeStore.dispatch).toHaveBeenLastCalledWith(
    "SHOW_NOTIFY_AND_NOT_SHOW_AGAIN_BUTTON",
    {
      message:
        "50021番ポートが使用中であるため エンジンA は、12345番ポートで起動しました",
      icon: "compare_arrows",
      tipName: "engineStartedOnAltPort",
    },
  );
});
