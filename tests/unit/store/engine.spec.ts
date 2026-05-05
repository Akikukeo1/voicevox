import { expect, test, vi } from "vitest";
import { createAltPortNotificationWatcher } from "@/store/engine";
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
    watch(
      _getter: (state: State) => unknown,
      callback: (newValue: unknown, oldValue: unknown) => void,
    ) {
      watchedCallback = callback;
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
  const state = {
    altPortInfos: {
      [engineId2]: "12345",
    },
    isVuexReady: true,
    confirmedTips: {
      engineStartedOnAltPort: false,
    },
    engineIds: [engineId1, engineId2],
    engineInfos: {
      [engineId1]: {
        name: "エンジンA",
        defaultPort: 50021,
      },
      [engineId2]: {
        name: "エンジンB",
        defaultPort: 50022,
      },
    },
  } as unknown as State;

  const { fakeStore, watchedCallback, unwatch } = createFakeStore(state);

  const stopWatching = createAltPortNotificationWatcher(fakeStore as never);
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
