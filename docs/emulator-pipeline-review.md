# Emulator Pipeline Review

Дата: 2026-03-19

Статус: review-only. Отчет описывает текущий pipeline запуска Android emulator и его слабые места без новых исправлений.

## Scope

Проверены файлы и связки, влияющие на запуск приложения на Android emulator:

- `mobile/package.json`
- `mobile/.env`
- `mobile/src/config.ts`
- `mobile/src/services/apiClient.ts`
- `mobile/src/services/WebSocketService.ts`
- `mobile/src/services/SignalingService.ts`
- `mobile/src/contexts/WebSocketProvider.tsx`
- `mobile/app.json`
- `mobile/android/app/build.gradle`
- `mobile/android/gradle.properties`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/android/app/src/main/java/com/anonymous/mobile/MainActivity.kt`
- `mobile/android/app/src/main/java/com/anonymous/mobile/MainApplication.kt`
- `server/.env`

## Pipeline

Текущая схема работы эмулятора:

1. Android emulator запускает установленный `dev build`.
2. Native Android слой стартует React Native / Expo host.
3. Приложение тянет JS bundle с Metro по `10.0.2.2:8081`.
4. После загрузки bundle исполняется `mobile/src/config.ts`.
5. `config.ts` вычисляет:
   - `API_BASE_URL`
   - WebSocket URL на `4001`
   - Signaling URL на `4002`
6. Дальше приложение идет в backend:
   - HTTP на `4000`
   - WS на `4001`
   - signaling на `4002`

Важно:

- `10.0.2.2:8081` относится к Metro dev server, а не к backend API.
- backend в текущем конфиге идет по LAN IP, а не через `10.0.2.2`.

## Findings

### High: У emulator pipeline две независимые точки отказа, которые легко спутать

Есть два разных класса проблем:

1. `Metro/Hermes/runtime`
   - красный экран
   - `Compiling JS failed`
   - `runtime not ready`
   - падение происходит до нормальной инициализации приложения

2. `API/WS/server connectivity`
   - приложение стартует, но не может логиниться, грузить чаты или держать realtime

На практике эти два слоя визуально легко смешать, но диагностически они разные. В текущем проекте основной historical blocker сидел именно в первом слое.

### High: Скрипт запуска эмулятора зависит от уже существующего Metro процесса

В [package.json](C:/Users/artem/Desktop/works/testik/mobile/package.json) используется:

- `android:emulator = expo run:android -d Pixel_4_API_36 --no-bundler`

Это означает:

- запуск не поднимает свой bundler;
- результат зависит от того, какой Metro уже висит на `8081`;
- старый Metro, старый кэш или параллельный процесс могут подсовывать не тот bundle.

Это один из самых хрупких элементов emulator workflow.

### High: В проекте одновременно существуют два валидных способа сетевого доступа, что повышает риск конфигурационного дрейфа

Сейчас в системе есть оба режима:

1. Wi-Fi / LAN
   - `mobile/.env` указывает на `http://192.168.1.85:4000/api`
   - это должно работать и на телефоне, и на эмуляторе без `adb reverse` для API

2. localhost-style access
   - `config.ts` умеет заменять `127.0.0.1` / `localhost` на `10.0.2.2` для emulator
   - `package.json` при этом все равно содержит `adb reverse` на `4000/4001/4002`

Следствие:

- проект поддерживает сразу и LAN-mode, и host-alias/reverse-mode;
- если кто-то меняет `.env` или логику запуска и забывает о втором режиме, поведение становится неочевидным.

### Medium: `adb reverse` для эмулятора частично избыточен при текущем LAN-конфиге

В [mobile/.env](C:/Users/artem/Desktop/works/testik/mobile/.env):

- `EXPO_PUBLIC_API_URL=http://192.168.1.85:4000/api`

В [config.ts](C:/Users/artem/Desktop/works/testik/mobile/src/config.ts):

- `192.168.x.x` не заменяется на `10.0.2.2`
- WebSocket и signaling строятся от того же host

Это означает:

- HTTP/WS/signaling должны идти напрямую на `192.168.1.85`
- `adb reverse tcp:4000/4001/4002` для текущего режима не обязателен
- реально обязательный reverse в таком сценарии нужен в первую очередь для `8081`, если используется Metro по USB path

Важно: это не баг, а operational ambiguity. Скрипты пробрасывают больше портов, чем требует текущий LAN-mode.

### Medium: В `config.ts` заложена полезная, но сложная логика адресации

[config.ts](C:/Users/artem/Desktop/works/testik/mobile/src/config.ts) решает сразу несколько сценариев:

- physical device + adb reverse
- physical device + Wi-Fi
- emulator + localhost
- explicit overrides через `EXPO_PUBLIC_USE_EMULATOR=true/false`

Плюсы:

- один файл покрывает все типы окружений

Минусы:

- поведение становится неочевидным без чтения кода
- человек может ошибочно считать, что `10.0.2.2` сейчас участвует в API path, хотя при `192.168.x.x` это не так

### Medium: Серверная конфигурация держит отдельный emulator redirect path, но mobile runtime на него напрямую не опирается

В [server/.env](C:/Users/artem/Desktop/works/testik/server/.env) есть:

- `LOGINUS_REDIRECT_URI=http://192.168.1.85:4000/api/auth/callback`
- `LOGINUS_REDIRECT_URI_EMULATOR=http://10.0.2.2:4000/api/auth/callback`

Это полезно для OAuth сценариев, но важно понимать:

- это backend/OAuth-конфиг, а не основной mobile API routing;
- red screen Hermes не связан напрямую с этим redirect URI.

### Medium: Native Android слой сейчас выглядит согласованным, но dev build по-прежнему чувствителен к stale install state

Согласованность сейчас нормальная:

- package id в [app.json](C:/Users/artem/Desktop/works/testik/mobile/app.json), [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle), [MainActivity.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainActivity.kt), [MainApplication.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainApplication.kt) совпадает как `com.anonymous.mobile`

Но operational risk остается:

- старая установка под прежним id уже встречалась;
- stale installed dev build может мешать отличать новый runtime от старого.

### Low: AndroidManifest не выглядит главным источником emulator issue

В [AndroidManifest.xml](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/AndroidManifest.xml):

- `INTERNET` permission есть
- activity/exported настроены штатно
- launcher intent filter корректный

Текущий manifest не выглядит главным подозреваемым для emulator startup issues.

### Low: В Expo config есть лишний шум

В [app.json](C:/Users/artem/Desktop/works/testik/mobile/app.json) продублирован один и тот же `intentFilter` для deep link callback.

Это не объясняет startup/runtime failure, но повышает конфигурационный шум и затрудняет audit Android слоя.

## File Responsibilities

### Metro / emulator boot

- [package.json](C:/Users/artem/Desktop/works/testik/mobile/package.json)
  - как запускается emulator build
  - используется ли `--no-bundler`
  - какие порты пробрасываются через `adb reverse`

### API / WS address resolution

- [mobile/.env](C:/Users/artem/Desktop/works/testik/mobile/.env)
  - базовый API host
- [config.ts](C:/Users/artem/Desktop/works/testik/mobile/src/config.ts)
  - rules:
    - `localhost/127.0.0.1` -> `10.0.2.2` для emulator
    - `192.168.x.x` остается без изменений
    - из API host строятся `4001/4002`

### HTTP / realtime

- [apiClient.ts](C:/Users/artem/Desktop/works/testik/mobile/src/services/apiClient.ts)
- [WebSocketProvider.tsx](C:/Users/artem/Desktop/works/testik/mobile/src/contexts/WebSocketProvider.tsx)
- [WebSocketService.ts](C:/Users/artem/Desktop/works/testik/mobile/src/services/WebSocketService.ts)
- [SignalingService.ts](C:/Users/artem/Desktop/works/testik/mobile/src/services/SignalingService.ts)

### Native Android

- [app.json](C:/Users/artem/Desktop/works/testik/mobile/app.json)
- [build.gradle](C:/Users/artem/Desktop/works/testik/mobile/android/app/build.gradle)
- [gradle.properties](C:/Users/artem/Desktop/works/testik/mobile/android/gradle.properties)
- [AndroidManifest.xml](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/AndroidManifest.xml)
- [MainActivity.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainActivity.kt)
- [MainApplication.kt](C:/Users/artem/Desktop/works/testik/mobile/android/app/src/main/java/com/anonymous/mobile/MainApplication.kt)

## Current Interpretation

На текущий момент emulator pipeline выглядит так:

- Metro path: `10.0.2.2:8081`
- API/WS path: `192.168.1.85:4000/4001/4002`

То есть:

- emulator действительно использует `10.0.2.2`, но только для JS bundle/dev server
- backend при текущем `.env` идет не через `10.0.2.2`, а напрямую по LAN IP

Это разделение важно, потому что:

- Hermes red screen указывает на проблемы в Metro/runtime path
- network issues с чатами проявились бы позже, уже после успешного старта приложения

## Main Risks To Monitor

1. Stale Metro на `8081` при `--no-bundler`
2. Смешение LAN-mode и reverse-mode в ожиданиях команды
3. Старый установленный dev build на emulator
4. Избыточная сложность `config.ts` без явного runtime logging адресов
5. Смешение runtime/Hermes ошибок с API/network проблемами

## Bottom Line

Главный вывод review:

- emulator startup path и backend connectivity path в проекте разделены и их нужно диагностировать отдельно;
- сейчас основной риск emulator pipeline не в IP backend, а в lifecycle Metro/dev build/stale state;
- текущий `.env` настроен на LAN-mode, поэтому `10.0.2.2` не должен участвовать в API/WS path;
- `10.0.2.2` в red screen относится к Metro bundle URL, а не к серверу чатов;
- operational workflow запуска emulator остается хрупким из-за `--no-bundler` и смешения нескольких режимов подключения.
