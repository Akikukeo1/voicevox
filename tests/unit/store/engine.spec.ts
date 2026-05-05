import { expect, test, vi } from "vitest";
import { createAltPortNotificationWatcher } from "@/store/engine";
import { store } from "@/store";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";
import type { State } from "@/store/type";
import type { EngineId } from "@/type/preload";

const createFakeStore = (state: State) => {
  let watchedCallback:
    | ((newValue: unknown, oldValue: unknown) => void)
    | undefined;
  const unwatch = vi.fn();

  const fakeStore = {
    state,
    dispatch: vi.fn(),
    watch<T>(
      _getter: (state: State, getters: unknown) => T,
      callback: (newValue: T, oldValue: T) => void,
    ) {
      watchedCallback = callback as (
        newValue: unknown,
        oldValue: unknown,
      ) => void;
      return unwatch;
    },
  };

  return {
    fakeStore,
    watchedCallback: () => watchedCallback,
    unwatch,
  };
};

test("代替ポートがないエンジンがあっても他のエンジンの通知を止めない", () => {
  const engineId1 = "engine-a" as EngineId;
  const engineId2 = "engine-b" as EngineId;
  const state = cloneWithUnwrapProxy(store.state);
  state.altPortInfos = {
    [engineId2]: "12345",
  };
  state.isVuexReady = true;
  state.confirmedTips = {
    tweakableSliderByScroll: false,
    engineStartedOnAltPort: false,
    notifyOnGenerate: false,
  };
  state.engineIds = [engineId1, engineId2];
  state.engineInfos = {
    [engineId1]: {
      uuid: engineId1,
      protocol: "http:",
      hostname: "localhost",
      defaultPort: "50021",
      pathname: "",
      name: "エンジンA",
      version: "1.0.0",
      executionEnabled: true,
      executionFilePath: "engine-a.exe",
      executionArgs: [],
      type: "path",
      isDefault: false,
    },
    [engineId2]: {
      uuid: engineId2,
      protocol: "http:",
      hostname: "localhost",
      defaultPort: "50022",
      pathname: "",
      name: "エンジンB",
      version: "1.0.0",
      executionEnabled: true,
      executionFilePath: "engine-b.exe",
      executionArgs: [],
      type: "path",
      isDefault: false,
    },
  };

  const { fakeStore, watchedCallback, unwatch } = createFakeStore(state);

  const stopWatching = createAltPortNotificationWatcher(fakeStore);
  expect(stopWatching).toBe(unwatch);
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
