# Hermes Runtime Review

Дата: 2026-03-19

Статус: review-only. В этом отчете перечислены текущие наблюдения и риски по Hermes/Android emulator без новых продуктовых исправлений.

## Scope

Проверены файлы и артефакты, связанные с Hermes runtime и Android dev build:

- `mobile/android/gradle.properties`
- `mobile/android/app/build.gradle`
- `mobile/android/app/src/main/java/com/anonymous/mobile/MainApplication.kt`
- `mobile/android/app/src/main/java/com/anonymous/mobile/MainActivity.kt`
- `mobile/app.json`
- `mobile/package.json`
- `mobile/patches/@react-navigation+core+7.16.1.patch`
- `mobile/patches/@react-navigation+routers+7.5.3.patch`
- `mobile/node_modules/@react-navigation/core/lib/module/*`
- `mobile/node_modules/@react-navigation/routers/lib/module/*`
- live Metro bundles, снятые с `:8081`
- `adb logcat` ошибки вида `Compiling JS failed`

## Findings

### High: Hermes runtime на эмуляторе остается нестабильным из-за vendor-level патчинга React Navigation

Текущая стратегия опирается на ручные патчи compiled JS в `@react-navigation/core` и `@react-navigation/routers` через `patch-package`. Это не единичный фикс, а уже постоянный слой совместимости поверх стороннего кода.

Ключевые файлы:

- [@react-navigation+core+7.16.1.patch](C:/Users/artem/Desktop/works/testik/mobile/patches/@react-navigation+core+7.16.1.patch)
- [@react-navigation+routers+7.5.3.patch](C:/Users/artem/Desktop/works/testik/mobile/patches/@react-navigation+routers+7.5.3.patch)

Что это означает:

- Hermes-путь зависит не только от версий библиотек, но и от локального состояния патчей.
- Любой `npm install` без корректного `postinstall` или любой drift в патчах может вернуть старые runtime ошибки.
- Сбой происходит до нормальной инициализации приложения, поэтому он маскирует реальные проблемы API/WS/UI.

### High: Источник ошибок мигрировал по нескольким модулям React Navigation, а не зафиксирован в одном месте

По `logcat` и живым bundle offsets ошибки приходили последовательно из разных частей navigation stack:

- routers: `TabRouter`, `StackRouter`
- core: `useNavigationBuilder`, `useOptionsGetters`, `BaseNavigationContainer`
- linking: `getPathFromState`, `getStateFromPath`, `StaticNavigation`, `validatePathConfig`

Это важный признак системной, а не локальной проблемы: Hermes runtime ломался не на одном модуле, а на серии конструкций в vendor code.

Подтверждение в bundle:

- [metro-current.bundle.js](C:/Users/artem/Desktop/works/testik/mobile/metro-current.bundle.js)
- [metro-scan.bundle.js](C:/Users/artem/Desktop/works/testik/mobile/metro-scan.bundle.js)

### High: Отчетность в проекте отстает от фактического состояния Hermes-слоя

Старый отчет не отражал текущий масштаб патчей и уже не соответствовал реальному состоянию runtime. В частности, проблемы давно вышли за пределы одного `useNavigationBuilder.js`.

Это критично для сопровождения, потому что:

- команда может считать проблему локально закрытой, хотя Hermes-риск остается распределенным по нескольким файлам;
- документация перестает быть надежным источником при следующем инциденте.

### Medium: `android:emulator` сценарий сам по себе повышает риск stale Metro/runtime drift

В [package.json](C:/Users/artem/Desktop/works/testik/mobile/package.json) скрипт:

- `android:emulator = expo run:android -d Pixel_4_API_36 --no-bundler`

Это означает:

- приложение собирается без собственного bundler;
- runtime полностью зависит от уже поднятого Metro процесса;
- старый Metro или старый кэш легко дают ложное ощущение "новая ошибка", хотя фактически отдается старый bundle.

Это не root cause Hermes parser bugs, но это сильный multiplier для нестабильности и плохой воспроизводимости.

### Medium: В Android build chain есть отдельный риск, не равный Hermes parser error, но усиливающий нестабильность

По предыдущим проверкам `gradlew clean` падал на stale autolinking/codegen JNI references. Это не тот же сбой, что Hermes compile error, но это ухудшает способность делать чистый reset Android-сборки.

Связанные файлы:

- [gradle.properties](C:/Users/artem/Desktop/works/testik/mobile/android/gradle.properties)
- [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle)

Следствие:

- невозможно уверенно отделять "битый runtime bundle" от "грязного native build state" без дополнительных ручных чисток;
- воспроизводимость инцидента ухудшается.

### Medium: Hermes обязателен, fallback на JSC фактически непрактичен

В [gradle.properties](C:/Users/artem/Desktop/works/testik/mobile/android/gradle.properties) выставлено:

- `newArchEnabled=true`
- `hermesEnabled=true`

В [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle) еще есть JSC fallback branch, но в текущем стеке RN 0.83 + worklets/reanimated это не выглядит рабочей аварийной стратегией.

Практический вывод:

- "давайте просто выключим Hermes" не является надежным вариантом для этого проекта;
- проблему нужно рассматривать как Hermes-first runtime issue.

### Medium: Expo/Android конфиг в целом согласован, но содержит шум, повышающий стоимость отладки

Найдено:

- дублированный `intentFilter` в [app.json](C:/Users/artem/Desktop/works/testik/mobile/app.json)
- жестко зашитые device/emulator scripts в [package.json](C:/Users/artem/Desktop/works/testik/mobile/package.json)

Это не объясняет parser error напрямую, но повышает cognitive load при разборе Android поведения.

### Low: API/network layer не выглядит текущим источником Hermes compile failure

Текущее mobile env:

- [mobile/.env](C:/Users/artem/Desktop/works/testik/mobile/.env)

Путь адресации:

- API идет по `192.168.1.85:4000`
- WebSocket по `192.168.1.85:4001`
- signaling по `192.168.1.85:4002`

`10.0.2.2:8081` в red screen относится к Metro bundle URL, а не к backend API.

Следствие:

- network misconfiguration не выглядит основным объяснением текущих Hermes parser errors;
- точка отказа находится раньше, на этапе загрузки/компиляции JS bundle.

## Inspected Hermes-Specific State

### Android / native

- [gradle.properties](C:/Users/artem/Desktop/works/testik/mobile/android/gradle.properties)
  - `newArchEnabled=true`
  - `hermesEnabled=true`
- [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle)
  - `hermes-android` подключается при включенном Hermes
  - bundle идет через Expo CLI `export:embed`
- [MainApplication.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainApplication.kt)
  - используется Expo React host
  - новый architecture entrypoint активен
- [MainActivity.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainActivity.kt)
  - стандартный Expo/RN entrypoint

### Dependency / patch layer

Сейчас Hermes-совместимость опирается на локальные патчи как минимум в этих vendor-модулях:

- `BaseNavigationContainer.js`
- `useNavigationBuilder.js`
- `useOptionsGetters.js`
- `getPatternParts.js`
- `getPathFromState.js`
- `getStateFromPath.js`
- `validatePathConfig.js`
- `StaticNavigation.js`
- `BaseRouter.js`
- `CommonActions.js`
- `DrawerRouter.js`
- `StackRouter.js`
- `TabRouter.js`
- `createRouteFromAction.js`

### Build / validation signals

Проверки, которые проходили успешно в текущем состоянии:

- `npx expo install --check`
- `npx expo export --platform android --dev --no-minify`

Это означает:

- dependency graph Expo сейчас согласован;
- bundler способен собрать Android dev bundle;
- но это не гарантирует отсутствие runtime parser error внутри эмулятора.

## Residual Risks

Даже после текущих патчей остаются архитектурные риски:

1. Любой новый upgrade `@react-navigation/*` может заново открыть Hermes regressions.
2. Любой новый install/reset среды зависит от корректного повторного применения `patch-package`.
3. Emulator runtime может продолжать расходиться с "bundle compiled on host" диагностикой.
4. Пока не убран vendor patch layer, проблема Hermes остается операционно дорогой.

## Bottom Line

Главный вывод review:

- текущая проблема Hermes не выглядит как единичная ошибка в коде приложения;
- это системная нестабильность runtime-пути `Expo dev build + Hermes + React Navigation vendor code + Metro/emulator cycle`;
- основная концентрация риска находится в patched `@react-navigation/core` и `@react-navigation/routers`;
- network/API layer на данный момент не является главным подозреваемым;
- documentation и operational workflow вокруг Hermes до этого момента были недостаточно точными и не отражали реальный масштаб проблемы.

## Files To Watch First On Next Incident

- [gradle.properties](C:/Users/artem/Desktop/works/testik/mobile/android/gradle.properties)
- [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle)
- [package.json](C:/Users/artem/Desktop/works/testik/mobile/package.json)
- [@react-navigation+core+7.16.1.patch](C:/Users/artem/Desktop/works/testik/mobile/patches/@react-navigation+core+7.16.1.patch)
- [@react-navigation+routers+7.5.3.patch](C:/Users/artem/Desktop/works/testik/mobile/patches/@react-navigation+routers+7.5.3.patch)
- [getPathFromState.js](C:/Users/artem/Desktop/works/testik/mobile/node_modules/@react-navigation/core/lib/module/getPathFromState.js)
- [getStateFromPath.js](C:/Users/artem/Desktop/works/testik/mobile/node_modules/@react-navigation/core/lib/module/getStateFromPath.js)
- [useNavigationBuilder.js](C:/Users/artem/Desktop/works/testik/mobile/node_modules/@react-navigation/core/lib/module/useNavigationBuilder.js)
- [StackRouter.js](C:/Users/artem/Desktop/works/testik/mobile/node_modules/@react-navigation/routers/lib/module/StackRouter.js)
- [TabRouter.js](C:/Users/artem/Desktop/works/testik/mobile/node_modules/@react-navigation/routers/lib/module/TabRouter.js)
