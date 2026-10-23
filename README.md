# RackManager

RackManager to projekt monitoringu szafy serwerowej: panel WWW działa w Node.js, a katalog sprzętowy gromadzi pliki PCB i dokumentację urządzenia.

## Zawartość repozytorium

```text
RackManager/
├── Code/                 # Aplikacja Node.js i panel WWW
│   ├── public/            # Interfejs użytkownika
│   ├── src/               # Serwer, API i odczyty systemowe
│   ├── .env.example       # Przykładowa konfiguracja
│   └── README.md          # Instrukcja aplikacji
├── Hardware/
│   ├── Gerber/            # Pliki produkcyjne PCB i oryginalny ZIP
│   ├── Schematics/        # Schematy elektryczne
│   └── Datasheets/        # Karty katalogowe podzespołów
├── .gitignore
└── README.md
```

## Szybki start

Wymagany jest Node.js 18 lub nowszy. W terminalu przejdź do `Code`, zainstaluj zależności i uruchom panel:

```bash
cd Code
npm install
npm start
```

Otwórz [http://localhost:3000](http://localhost:3000). Domyślnie działa tryb demonstracyjny, więc panel można obejrzeć bez podłączonej płytki.

## Sprzęt

Do `Hardware/Gerber` dołączono pliki warstw miedzi, soldermaski, opisu, obrysu i wierceń wraz z plikiem `How-to-order-PCB.txt` oraz dostarczonym archiwum źródłowym. Katalogi schematów i datasheetów są przygotowane do uzupełnienia; nie zawierały plików wejściowych w przekazanym materiale.

## Publikacja na GitHubie

Repozytorium ignoruje `node_modules`, ustawienia lokalne `.env` i pliki tymczasowe. Plik `package-lock.json` powinien pozostać w repozytorium, by instalacje zależności były powtarzalne. Przed publikacją sprawdź, czy do repozytorium nie trafiają prywatne dane, klucze ani dokumenty, do których nie masz praw.

## Stan projektu

Panel udostępnia metryki CPU, RAM, SWAP, dysku i temperatury DS18B20, status serwera oraz endpointy HTTP. Obsługa drzwi, napięcia, prądu, energii, Modbus/Multimax i konfiguracja węzłów wymagają określenia interfejsu i protokołu sprzętowego. Obecny interfejs oznacza te odczyty jako niepodłączone zamiast prezentować fikcyjne wartości.
