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

Przykład konfiguracji sprzętowej:

```dotenv
HOST=0.0.0.0
PORT=3000
DEMO_MODE=false
UPDATE_INTERVAL_MS=2000
```

## Struktura

```text
Code/
├── public/                 # Interfejs HTML, CSS i JavaScript
├── src/
│   ├── routes/api.js       # Endpointy HTTP
│   ├── services/           # Odczyt metryk rzeczywistych i demonstracyjnych
│   ├── config.js           # Konfiguracja środowiska
│   └── server.js           # Express i WebSocket
├── .env.example
└── package.json
```

## Metryki sprzętowe

W trybie rzeczywistym aplikacja odczytuje zasoby hosta przez API Node.js oraz system plików Linuksa (temperatura termiczna, SWAP, DS18B20). Brak dostępnego czujnika jest zwracany jako `null` i widoczny w panelu jako „—”. Obsługa wejścia drzwi, pomiaru zasilania, Multimax/Modbus i pozostałych węzłów wymaga dopisania adaptera do `src/services` po ustaleniu pinów, adresów i protokołu płytki.

### Model urządzenia Multimax

Planowany rekord urządzenia może zawierać: `id`, `name`, `type`, `protocol`, `interface`, `address`, `firmwareVersion`, `hardwareVersion`, `serialNumber`, `status` i `lastSeen`. W zależności od możliwości protokołu można dodać `protocolVersion`, `uptimeSeconds`, liczniki błędów/komunikacji oraz stany wejść/wyjść i pomiary właściwe dla modułu. Pola muszą odzwierciedlać dane rzeczywiście zwracane przez urządzenie. Obecny wpis demonstracyjny nie jest odczytem z fizycznej magistrali; parser RS-485 nie jest jeszcze zaimplementowany.

## Prywatność i dostęp

Serwer domyślnie nasłuchuje na wszystkich interfejsach sieciowych, aby panel był osiągalny w sieci lokalnej. Wystaw go poza zaufaną sieć dopiero po skonfigurowaniu zapory i warstwy uwierzytelniania. Plik `.env` nie powinien trafiać do Git.
