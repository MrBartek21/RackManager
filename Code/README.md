# RackManager — aplikacja

Aplikacja Node.js udostępnia responsywny panel WWW, API HTTP oraz strumień aktualizacji WebSocket. Szczegóły projektu i opis sprzętu znajdują się w głównym [README](../README.md).

## Wymagania

- Node.js 18 lub nowszy
- npm

## Uruchomienie

```bash
npm install
npm start
```

Panel: `http://localhost:3000`  
Sprawdzenie serwera: `http://localhost:3000/api/health`  
Bieżący stan: `http://localhost:3000/api/status`  
Aktualizacje na żywo: `ws://localhost:3000/ws`

Tryb deweloperski z automatycznym restartem po zmianie serwera:

```bash
npm run dev
```

## Konfiguracja

Skopiuj `.env.example` do `.env` i zmień wartości zależnie od środowiska. Domyślnie aplikacja używa demonstracyjnych danych, dzięki czemu można uruchomić ją także na komputerze bez docelowej płytki.

| Zmienna | Wartość domyślna | Opis |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Adres nasłuchiwania serwera |
| `PORT` | `3000` | Port panelu i API |
| `DEMO_MODE` | `true` | `false` włącza odczyty hosta i DS18B20 |
| `UPDATE_INTERVAL_MS` | `2000` | Odstęp aktualizacji WebSocket (500–60000 ms) |
| `DEVICE_OFFLINE_TIMEOUT_MS` | `30000` | Czas bez komunikatu MultiMax, po którym urządzenie otrzymuje status offline |
| `MULTIMAX_PORT` | — | Port szeregowy RS-485, np. `/dev/serial0` lub `/dev/ttyUSB0` |
| `MULTIMAX_BAUD_RATE` | `115200` | Prędkość magistrali MultiMax, 8N1 |
| `MULTIMAX_REDE_GPIO` | `18` | GPIO BCM sterujące kierunkiem RS-485 |
| `RACKMANAGER_RELAY1_GPIO` | `23` | GPIO BCM przekaźnika `EXT_RLY` |
| `RACKMANAGER_RELAY2_GPIO` | `22` | GPIO BCM przekaźnika `POWER_RLY` |
| `RACKMANAGER_RELAY_ACTIVE_LOW` | `false` | Ustaw `true`, gdy wejście modułu przekaźnika jest aktywne stanem niskim |

Przykład konfiguracji sprzętowej:

```dotenv
HOST=0.0.0.0
PORT=3000
DEMO_MODE=false
UPDATE_INTERVAL_MS=2000
MULTIMAX_PORT=/dev/serial0
MULTIMAX_BAUD_RATE=115200
MULTIMAX_REDE_GPIO=18
RACKMANAGER_RELAY1_GPIO=23
RACKMANAGER_RELAY2_GPIO=22
RACKMANAGER_RELAY_ACTIVE_LOW=false
```

## Struktura

```text
Code/
├── public/                 # Interfejs HTML, CSS i JavaScript
│   ├── index.html          # Przegląd
│   ├── devices.html        # Tabela urządzeń i przekaźniki
│   ├── events.html         # Pełny dziennik zdarzeń
│   └── automations.html    # Kreator i lista automatyzacji
├── data/                   # Trwałe plikowe kolekcje JSON
│   ├── devices.json        # Zapisane i wykryte urządzenia
│   ├── events.json         # Dziennik zdarzeń
│   └── automations.json    # Reguły automatyzacji
├── src/
│   ├── routes/api.js       # Endpointy HTTP dla GUI i danych
│   ├── services/           # Metryki, kolekcje JSON i przetwarzanie automatyzacji
│   ├── config.js           # Konfiguracja środowiska
│   └── server.js           # Express i WebSocket
├── .env.example
└── package.json
```

Każdy widok jest osobnym dokumentem HTML, a menu używa zwykłych linków między stronami. GUI pobiera dane z `/api` i WebSocket. Serwer przechowuje urządzenia, zdarzenia i automatyzacje w katalogu `data`; pliki są tworzone automatycznie, jeśli ich brakuje. API kolekcji: `GET/POST /api/devices`, `DELETE /api/devices/:id`, `GET/POST/DELETE /api/events`, `GET/POST /api/automations`, `PATCH/DELETE /api/automations/:id`.

MultiMax v1 używa ramek binarnych: `AA 55`, wersja (1 B), cel (2 B BE), źródło (2 B BE), typ (1 B), numer sekwencji (2 B BE), długość payloadu (2 B BE), payload JSON UTF-8 i CRC-16/CCITT-FALSE (2 B BE) liczone od wersji do końca payloadu. Adres RackManager to `0`, broadcast `65535`, urządzenia `1–65534`. Magistrala działa 8N1; domyślnie `115200` bit/s. RackManager rozsyła `DISCOVER` z 64 slotami po 25 ms. Urządzenie wybiera slot jako `CRC16(UTF8(id) || epoch_uint16_be) % slots`, nasłuchuje magistrali przed nadaniem i wysyła `ANNOUNCE`; po `ANNOUNCE_ACK` kończy ogłaszanie. Jeśli nie dostanie ACK, próbuje ponownie przy następnej epoce discovery. `ANNOUNCE` zawiera `id`, `name`, `type`, wersje, numer seryjny i `commands` (listę identyfikatorów/etykiet). `COMMAND` z urządzenia uruchamia pasującą automatyzację; `EXECUTE` do urządzenia musi zakończyć się `RESULT` o tym samym numerze sekwencji.

| Typ | Kod | Kierunek | Payload |
| --- | --- | --- | --- |
| `DISCOVER` | `0x01` | RackManager → broadcast | `{"protocol":"MultiMax","version":1,"slots":64,"slotMs":25,"epoch":n}` |
| `ANNOUNCE_ACK` | `0x02` | RackManager → urządzenie | `{"accepted":true,"id":"..."}` |
| `ANNOUNCE` | `0x10` | urządzenie → RackManager | metadane urządzenia i `commands` |
| `HEARTBEAT` | `0x11` | urządzenie → RackManager | `{"id":"...","state":{...}}` |
| `COMMAND` | `0x20` | urządzenie → RackManager | `{"id":"...","command":"...","parameters":{...}}` |
| `COMMAND_ACK` | `0x21` | RackManager → urządzenie | `{"accepted":true}` lub błąd |
| `EXECUTE` | `0x30` | RackManager → urządzenie | `{"command":"...","action":"execute","parameters":{...}}` |
| `RESULT` | `0x31` | urządzenie → RackManager | `{"ok":true,"value":...}` albo `{"ok":false,"error":"..."}` |
| `READ_STATE` / `STATE` | `0x40` / `0x41` | oba kierunki | zapytanie i bieżący stan urządzenia |

Przykładowe payloady JSON:

```json
{"id":"MMX-01","name":"Moduł wejść","type":"Moduł I/O","firmwareVersion":"1.2.0","hardwareVersion":"A","serialNumber":"SN-01","commands":[{"id":"reset","label":"Reset modułu"},{"id":"set_output","label":"Ustaw wyjście"}]}
```

```json
{"id":"MMX-01","command":"button_pressed","parameters":{"input":2}}
```

Serwer otwiera `MULTIMAX_PORT`, wysyła discovery co 10 s, rejestruje ogłoszenia w `data/devices.json`, oznacza urządzenie offline po `DEVICE_OFFLINE_TIMEOUT_MS` i wysyła komendy przez tę samą magistralę. API `POST /api/multimax/message` udostępnia tę samą warstwę dla mostka/testera. Transmisje szeregują się, a `RS_REDE` jest ustawiane na nadawanie tylko na czas wysyłania ramki. GPIO obsługuje `pinctrl` (albo polecenie wskazane przez `RACKMANAGER_GPIO_COMMAND`).

### Pinout RackManager

Numery GPIO w konfiguracji są numerami BCM:

| Funkcja | Pin |
| --- | --- |
| POWER_LED | GP5 |
| OK_LED | GP6 |
| BUZZER | GP12 |
| ACT_LED | GP13 |
| DOOR_BTN | GP25 |
| EXT_RLY | GP23 |
| POWER_BTN | GP24 |
| POWER_RLY | GP22 |
| DS18B20 | GP4 |
| RS_DI / nadajnik UART | TXO |
| RS_RO / odbiornik UART | RXI |
| RS_REDE / kierunek RS-485 | GP18 |
| Wyświetlacz CLK / DIO | GP17 / GP27 |
| MCP3008 CLK / DOUT / DIN / CS | SCLK / MISO / MOSI / CE0 (SPI0) |

W tej wersji bezpośrednie sterowanie i odczyt GPIO są podłączone dla przekaźników `EXT_RLY` i `POWER_RLY`. RS-485 korzysta z UART `/dev/serial0` i pinu kierunku GP18. Pozostałe sygnały (LED, buzzer, przyciski, wyświetlacz, DS18B20 oraz MCP3008) są opisane pinoutem, ale ich obsługa programowa nie jest jeszcze podłączona. Dla wejść analogowych MCP3008 trzeba jeszcze ustalić kanał każdego czujnika, skalowanie i kalibrację; same nazwy pinów SPI określają tylko połączenie magistrali.

## Metryki sprzętowe

W trybie rzeczywistym aplikacja odczytuje zasoby hosta przez API Node.js oraz system plików Linuksa (temperatura termiczna, SWAP, DS18B20). Brak dostępnego czujnika jest zwracany jako `null` i widoczny w panelu jako „—”. Obsługa wejścia drzwi, pomiaru zasilania, Multimax/Modbus i pozostałych węzłów wymaga dopisania adaptera do `src/services` po ustaleniu pinów, adresów i protokołu płytki.

### Model urządzenia Multimax

Rekord urządzenia przechowuje `id`, `name`, `type`, `protocol`, `interface`, `address`, `firmwareVersion`, `hardwareVersion`, `serialNumber`, listę `commands`, `status` i `lastSeen`. Urządzenia mogą także zgłaszać własny stan w `HEARTBEAT`/`STATE`; wpisy demonstracyjne nie są odczytem z fizycznej magistrali.

## Prywatność i dostęp

Serwer domyślnie nasłuchuje na wszystkich interfejsach sieciowych, aby panel był osiągalny w sieci lokalnej. Wystaw go poza zaufaną sieć dopiero po skonfigurowaniu zapory i warstwy uwierzytelniania. Plik `.env` nie powinien trafiać do Git.
