/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests the quick suggest weather feature.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  UrlbarProviderWeather: "resource:///modules/UrlbarProviderWeather.sys.mjs",
});

const HISTOGRAM_LATENCY = "FX_URLBAR_MERINO_LATENCY_WEATHER_MS";
const HISTOGRAM_RESPONSE = "FX_URLBAR_MERINO_RESPONSE_WEATHER";

const { WEATHER_RS_DATA, WEATHER_SUGGESTION } = MerinoTestUtils;

add_setup(async () => {
  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    prefs: [["suggest.quicksuggest.nonsponsored", true]],
    remoteSettingsRecords: [
      {
        type: "weather",
        weather: WEATHER_RS_DATA,
      },
    ],
  });

  await MerinoTestUtils.initWeather();
});

// The feature should be properly uninitialized when it's disabled and then
// re-initialized when it's re-enabled. This task disables the feature using the
// feature gate pref.
add_tasks_with_rust(async function disableAndEnable_featureGate() {
  await doBasicDisableAndEnableTest("weather.featureGate");
});

// The feature should be properly uninitialized when it's disabled and then
// re-initialized when it's re-enabled. This task disables the feature using the
// suggest pref.
add_tasks_with_rust(async function disableAndEnable_suggestPref() {
  await doBasicDisableAndEnableTest("suggest.weather");
});

async function doBasicDisableAndEnableTest(pref) {
  // Disable the feature. It should be immediately uninitialized.
  UrlbarPrefs.set(pref, false);
  assertDisabled({
    message: "After disabling",
  });

  // No suggestion should be returned for a search.
  let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [],
  });

  let histograms = MerinoTestUtils.getAndClearHistograms({
    extraLatency: HISTOGRAM_LATENCY,
    extraResponse: HISTOGRAM_RESPONSE,
  });

  // Re-enable the feature.
  info("Re-enable the feature");
  UrlbarPrefs.set(pref, true);

  // The suggestion should be returned for a search.
  context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [QuickSuggestTestUtils.weatherResult()],
  });

  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: "success",
    latencyRecorded: true,
    client: QuickSuggest.weather._test_merino,
  });
}

// Tests a Merino fetch that doesn't return a suggestion.
add_tasks_with_rust(async function noSuggestion() {
  let histograms = MerinoTestUtils.getAndClearHistograms({
    extraLatency: HISTOGRAM_LATENCY,
    extraResponse: HISTOGRAM_RESPONSE,
  });

  let { suggestions } = MerinoTestUtils.server.response.body;
  MerinoTestUtils.server.response.body.suggestions = [];

  let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [],
  });

  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: "no_suggestion",
    latencyRecorded: true,
    client: QuickSuggest.weather._test_merino,
  });

  MerinoTestUtils.server.response.body.suggestions = suggestions;
});

// Tests a Merino fetch that fails with a network error.
add_tasks_with_rust(async function networkError() {
  // This task is unreliable on Windows. See the comment in
  // `MerinoTestUtils.withNetworkError()`.
  if (AppConstants.platform == "win") {
    Assert.ok(true, "Skipping this task on Windows");
    return;
  }

  let histograms = MerinoTestUtils.getAndClearHistograms({
    extraLatency: HISTOGRAM_LATENCY,
    extraResponse: HISTOGRAM_RESPONSE,
  });

  await MerinoTestUtils.server.withNetworkError(async () => {
    let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    });
    await check_results({
      context,
      matches: [],
    });
  });

  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: "network_error",
    latencyRecorded: false,
    client: QuickSuggest.weather._test_merino,
  });
});

// Tests a Merino fetch that fails with an HTTP error.
add_tasks_with_rust(async function httpError() {
  let histograms = MerinoTestUtils.getAndClearHistograms({
    extraLatency: HISTOGRAM_LATENCY,
    extraResponse: HISTOGRAM_RESPONSE,
  });

  MerinoTestUtils.server.response = { status: 500 };

  let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [],
  });

  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: "http_error",
    latencyRecorded: true,
    client: QuickSuggest.weather._test_merino,
  });

  MerinoTestUtils.server.reset();
  MerinoTestUtils.server.response.body.suggestions = [WEATHER_SUGGESTION];
});

// Tests a Merino fetch that fails due to a client timeout.
add_tasks_with_rust(async function clientTimeout() {
  let histograms = MerinoTestUtils.getAndClearHistograms({
    extraLatency: HISTOGRAM_LATENCY,
    extraResponse: HISTOGRAM_RESPONSE,
  });

  // Make the server return a delayed response so the Merino client times out
  // waiting for it.
  MerinoTestUtils.server.response.delay = 400;

  // Make the client time out immediately.
  QuickSuggest.weather._test_setTimeoutMs(1);

  // Set up a promise that will be resolved when the client finally receives the
  // response.
  let responsePromise = QuickSuggest.weather._test_merino.waitForNextResponse();

  let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [],
  });

  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: "timeout",
    latencyRecorded: false,
    latencyStopwatchRunning: true,
    client: QuickSuggest.weather._test_merino,
  });

  // Await the response.
  await responsePromise;

  // The `checkAndClearHistograms()` call above cleared the histograms. After
  // that, nothing else should have been recorded for the response.
  MerinoTestUtils.checkAndClearHistograms({
    histograms,
    response: null,
    latencyRecorded: true,
    client: QuickSuggest.weather._test_merino,
  });

  QuickSuggest.weather._test_setTimeoutMs(-1);
  delete MerinoTestUtils.server.response.delay;
});

// Locale task for when this test runs on an en-US OS.
add_tasks_with_rust(async function locale_enUS() {
  await doLocaleTest({
    shouldRunTask: osLocale => osLocale == "en-US",
    osUnit: "f",
    unitsByLocale: {
      "en-US": "f",
      // When the app's locale is set to any en-* locale, F will be used because
      // `regionalPrefsLocales` will prefer the en-US OS locale.
      "en-CA": "f",
      "en-GB": "f",
      de: "c",
    },
  });
});

// Locale task for when this test runs on a non-US English OS.
add_tasks_with_rust(async function locale_nonUSEnglish() {
  await doLocaleTest({
    shouldRunTask: osLocale => osLocale.startsWith("en") && osLocale != "en-US",
    osUnit: "c",
    unitsByLocale: {
      // When the app's locale is set to en-US, C will be used because
      // `regionalPrefsLocales` will prefer the non-US English OS locale.
      "en-US": "c",
      "en-CA": "c",
      "en-GB": "c",
      de: "c",
    },
  });
});

// Locale task for when this test runs on a non-English OS.
add_tasks_with_rust(async function locale_nonEnglish() {
  await doLocaleTest({
    shouldRunTask: osLocale => !osLocale.startsWith("en"),
    osUnit: "c",
    unitsByLocale: {
      "en-US": "f",
      "en-CA": "c",
      "en-GB": "c",
      de: "c",
    },
  });
});

/**
 * Testing locales is tricky due to the weather feature's use of
 * `Services.locale.regionalPrefsLocales`. By default `regionalPrefsLocales`
 * prefers the OS locale if its language is the same as the app locale's
 * language; otherwise it prefers the app locale. For example, assuming the OS
 * locale is en-CA, then if the app locale is en-US it will prefer en-CA since
 * both are English, but if the app locale is de it will prefer de. If the pref
 * `intl.regional_prefs.use_os_locales` is set, then the OS locale is always
 * preferred.
 *
 * This function tests a given set of locales with and without
 * `intl.regional_prefs.use_os_locales` set.
 *
 * @param {object} options
 *   Options
 * @param {Function} options.shouldRunTask
 *   Called with the OS locale. Should return true if the function should run.
 *   Use this to skip tasks that don't target a desired OS locale.
 * @param {string} options.osUnit
 *   The expected "c" or "f" unit for the OS locale.
 * @param {object} options.unitsByLocale
 *   The expected "c" or "f" unit when the app's locale is set to particular
 *   locales. This should be an object that maps locales to expected units. For
 *   each locale in the object, the app's locale is set to that locale and the
 *   actual unit is expected to be the unit in the object.
 */
async function doLocaleTest({ shouldRunTask, osUnit, unitsByLocale }) {
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", true);
  let osLocale = Services.locale.regionalPrefsLocales[0];
  Services.prefs.clearUserPref("intl.regional_prefs.use_os_locales");

  if (!shouldRunTask(osLocale)) {
    info("Skipping task, should not run for this OS locale");
    return;
  }

  // Sanity check initial locale info.
  Assert.equal(
    Services.locale.appLocaleAsBCP47,
    "en-US",
    "Initial app locale should be en-US"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales"),
    "intl.regional_prefs.use_os_locales should be false initially"
  );

  // Check locales.
  for (let [locale, temperatureUnit] of Object.entries(unitsByLocale)) {
    await QuickSuggestTestUtils.withLocales({
      locales: [locale],
      callback: async () => {
        info("Checking locale: " + locale);
        await check_results({
          context: createContext(MerinoTestUtils.WEATHER_KEYWORD, {
            providers: [
              UrlbarProviderQuickSuggest.name,
              UrlbarProviderWeather.name,
            ],
            isPrivate: false,
          }),
          matches: [QuickSuggestTestUtils.weatherResult({ temperatureUnit })],
        });

        info(
          "Checking locale with intl.regional_prefs.use_os_locales: " + locale
        );
        Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", true);
        await check_results({
          context: createContext(MerinoTestUtils.WEATHER_KEYWORD, {
            providers: [
              UrlbarProviderQuickSuggest.name,
              UrlbarProviderWeather.name,
            ],
            isPrivate: false,
          }),
          matches: [
            QuickSuggestTestUtils.weatherResult({ temperatureUnit: osUnit }),
          ],
        });
        Services.prefs.clearUserPref("intl.regional_prefs.use_os_locales");
      },
    });
  }
}

// Blocks a result and makes sure the weather pref is disabled.
add_tasks_with_rust(async function block() {
  // Sanity check initial state.
  Assert.ok(
    UrlbarPrefs.get("suggest.weather"),
    "Sanity check: suggest.weather is true initially"
  );

  // Do a search so we can get an actual result.
  let context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [QuickSuggestTestUtils.weatherResult()],
  });

  // Block the result.
  const controller = UrlbarTestUtils.newMockController();
  controller.setView({
    get visibleResults() {
      return context.results;
    },
    controller: {
      removeResult() {},
    },
  });
  let result = context.results[0];
  let provider = UrlbarProvidersManager.getProvider(result.providerName);
  Assert.ok(provider, "Sanity check: Result provider found");

  provider.onEngagement(context, controller, {
    result,
    selType: "dismiss",
    selIndex: context.results[0].rowIndex,
  });
  Assert.ok(
    !UrlbarPrefs.get("suggest.weather"),
    "suggest.weather is false after blocking the result"
  );

  // Do a second search. Nothing should be returned.
  context = createContext(MerinoTestUtils.WEATHER_KEYWORD, {
    providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
    isPrivate: false,
  });
  await check_results({
    context,
    matches: [],
  });

  // Re-enable the pref and (when Rust is disabled) wait for keywords to be
  // re-synced from remote settings.
  UrlbarPrefs.set("suggest.weather", true);
  await QuickSuggestTestUtils.forceSync();
});

// When a Nimbus experiment is installed, it should override the remote settings
// weather record.
add_tasks_with_rust(async function nimbusOverride() {
  let defaultResult = QuickSuggestTestUtils.weatherResult();

  // Verify a search works as expected with the default remote settings weather
  // record (which was added in the init task).
  await check_results({
    context: createContext(MerinoTestUtils.WEATHER_KEYWORD, {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [defaultResult],
  });

  // Install an experiment with a different keyword and min length.
  let nimbusCleanup = await UrlbarTestUtils.initNimbusFeature({
    weatherKeywords: ["nimbusoverride"],
    weatherKeywordsMinimumLength: "nimbus".length,
  });

  // The usual default keyword shouldn't match.
  await check_results({
    context: createContext(MerinoTestUtils.WEATHER_KEYWORD, {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [],
  });

  // The new keyword from Nimbus should match. Since keywords are defined in
  // Nimbus, the result will be served from UrlbarProviderWeather and its source
  // will be "merino", not "rust", even when Rust is enabled.
  let merinoResult = QuickSuggestTestUtils.weatherResult({
    source: "merino",
    provider: "accuweather",
    telemetryType: null,
  });
  await check_results({
    context: createContext("nimbusoverride", {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [merinoResult],
  });
  await check_results({
    context: createContext("nimbus", {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [merinoResult],
  });

  // Uninstall the experiment.
  await nimbusCleanup();

  // The usual default keyword should match again.
  await check_results({
    context: createContext(MerinoTestUtils.WEATHER_KEYWORD, {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [defaultResult],
  });

  // The keywords from Nimbus shouldn't match anymore.
  await check_results({
    context: createContext("nimbusoverride", {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [],
  });
  await check_results({
    context: createContext("nimbus", {
      providers: [UrlbarProviderQuickSuggest.name, UrlbarProviderWeather.name],
      isPrivate: false,
    }),
    matches: [],
  });
});

function assertDisabled({ message }) {
  info("Asserting feature is disabled");
  if (message) {
    info(message);
  }
  Assert.strictEqual(
    QuickSuggest.weather._test_merino,
    null,
    "Merino client is null"
  );
}
