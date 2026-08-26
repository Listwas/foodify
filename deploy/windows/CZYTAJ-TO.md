# Foodify na Windowsie — instrukcja

Instalacja na czystym komputerze, na którym nie ma nic zainstalowanego.
Skrypt sam dociąga Pythona i Node.js, buduje aplikację i robi skrót na pulpicie.

## Najlepszy wariant (zalecany)

Wgraj na pendrive **dwa pliki**:

1. `install-foodify.ps1` (ten katalog)
2. `foodify.db` — Twoja gotowa baza, skopiuj ją z `backend/foodify.db`

Dlaczego baza: ma już 511 przepisów **z policzonymi makrami**. Bez niej skrypt
ściąga przepisy z internetu (5-10 minut), a makra i tak się nie policzą, bo do
tego potrzebny jest klucz Gemini.

Na jej komputerze: kliknij prawym na `install-foodify.ps1` → **Uruchom w
programie PowerShell**. Gdyby Windows zablokował skrypt, otwórz PowerShell
w tym katalogu i wklej:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-foodify.ps1
```

To wszystko. Po kilku minutach wyskoczy przeglądarka z działającą aplikacją,
a na pulpicie pojawi się ikona **Foodify**.

## Wariant bez pendrive'a

Jeśli nie masz przy sobie bazy, skrypt pobierze wszystko z GitHuba sam —
wystarczy sam `install-foodify.ps1`. Przepisy dociągnie z internetu, tylko
potrwa dłużej i nie będzie makr.

## Co robi skrypt

1. Instaluje Pythona i Node.js przez `winget` (wbudowany w Windows 10/11) —
   pomija, jeśli już są
2. Pobiera aplikację (albo używa plików obok siebie, jak są)
3. Stawia środowisko Pythona i instaluje biblioteki
4. Buduje interfejs
5. Wgrywa bazę albo pobiera przepisy
6. Robi skrót na pulpicie i ustawia autostart z Windowsem

Można go puszczać wielokrotnie — aktualizuje to, co już jest, i **nie nadpisuje
bazy**, więc jej plan posiłków i swipe'y przetrwają aktualizację.

## Opcje

```powershell
# z kluczem Gemini (włącza generowanie przepisów przez AI)
.\install-foodify.ps1 -GeminiKey "twój-klucz"

# bez autostartu z Windowsem
.\install-foodify.ps1 -NoAutostart

# inny port
.\install-foodify.ps1 -Port 8080
```

## Na telefonie

Aplikacja słucha na całej sieci, więc jej telefon (na tym samym wifi) wejdzie na
`http://<ip-komputera>:8000`. IP sprawdzisz komendą `ipconfig` (szukaj "IPv4").

Potem w przeglądarce na telefonie: **Udostępnij → Do ekranu początkowego**
(iPhone) albo **menu ⋮ → Zainstaluj aplikację** (Android). Dostanie ikonę i
pełny ekran, wygląda jak normalna apka.

## Jak coś nie zadziała

| Problem | Co zrobić |
|---|---|
| „nie można załadować, ponieważ uruchamianie skryptów jest wyłączone" | użyj komendy z `-ExecutionPolicy Bypass` powyżej |
| „brak winget" | zainstaluj ręcznie [Pythona](https://www.python.org/downloads/) (zaznacz *Add python.exe to PATH*) i [Node.js LTS](https://nodejs.org/en/download), potem puść skrypt ponownie |
| „system go jeszcze nie widzi" | zamknij PowerShell, otwórz nowy, puść skrypt jeszcze raz |
| aplikacja się nie otwiera | kliknij ikonę Foodify na pulpicie, poczekaj 5 sekund, wejdź na `http://localhost:8000` |
| port zajęty | `.\install-foodify.ps1 -Port 8080` |

## Ważne: to jest osobna kopia

Jej aplikacja ma **własną bazę** — osobny plan posiłków, osobne swipe'y, osobny
profil smaku. Jak zaplanujesz coś u siebie, u niej się to nie pojawi.

Jeśli chcesz **wspólny plan**, to nie ta droga — wtedy lepiej, żeby wchodziła na
Twoją instancję przez Tailscale (patrz [DEPLOY.md](../../DEPLOY.md)). Minus:
działa tylko gdy Twój komputer jest włączony.
