# Foodify na Windowsie

Trzy kroki, nic więcej.

## 1. Pobierz

Wejdź na https://github.com/Listwas/foodify → zielony przycisk **Code** →
**Download ZIP**.

## 2. Rozpakuj

Kliknij prawym na pobrany plik → **Wyodrębnij wszystkie**. Wypakuj gdzieś na
stałe, np. do `Dokumenty` — **nie do Pobranych**, bo folder musi zostać (aplikacja
z niego działa).

## 3. Uruchom `INSTALUJ.bat`

W rozpakowanym folderze kliknij dwa razy **`INSTALUJ.bat`**.

- Jeśli Windows pokaże niebieskie okno *„System Windows ochronił Twój komputer"*
  → kliknij **Więcej informacji** → **Uruchom mimo to**
- Jeśli wyskoczy pytanie o instalację Pythona albo Node.js → **zgódź się**

Reszta dzieje się sama, trwa kilka minut. Na końcu otworzy się przeglądarka
z działającą aplikacją, a na pulpicie pojawi się ikona **Foodify**.

---

## Co dostajesz od razu

- **511 przepisów** z policzonymi kaloriami i makrami — nic się nie dociąga,
  baza jedzie razem z paczką
- Aplikacja startuje razem z Windowsem (można wyłączyć, patrz niżej)
- Ikona na pulpicie do ręcznego odpalania

## Potem

Odpalasz **ikoną Foodify z pulpitu** albo plikiem **`START.bat`** w folderze.

Żeby zamknąć — zamknij czarne okno konsoli.

## Na telefonie

Aplikacja jest widoczna w całej sieci wifi. Na komputerze wpisz w konsolę
`ipconfig` i znajdź adres **IPv4** (coś jak `192.168.0.14`). Na telefonie wejdź
na `http://192.168.0.14:8000`.

Potem możesz ją zainstalować jak normalną apkę:
- **iPhone**: *Udostępnij* → *Do ekranu początkowego*
- **Android**: menu *⋮* → *Zainstaluj aplikację*

Dostaniesz ikonę i pełny ekran, bez paska przeglądarki. Działa tylko gdy
komputer jest włączony.

## Jak coś nie zadziała

| Problem | Rozwiązanie |
|---|---|
| Okno mignęło i zniknęło | uruchom `INSTALUJ.bat` jeszcze raz — teraz zostanie otwarte i pokaże błąd |
| „brak winget" | zainstaluj ręcznie [Pythona](https://www.python.org/downloads/) (**zaznacz „Add python.exe to PATH"**) i [Node.js LTS](https://nodejs.org/en/download), potem odpal `INSTALUJ.bat` ponownie |
| „system jeszcze go nie widzi" | zamknij okno, odpal `INSTALUJ.bat` jeszcze raz |
| Port zajęty / nie otwiera się | w konsoli: `powershell -ExecutionPolicy Bypass -File deploy\windows\install-foodify.ps1 -Port 8080` |
| Nie chcę autostartu | usuń skrót *Foodify* z `shell:startup` (Win+R → wpisz `shell:startup`) |

## Opcje instalatora

```powershell
# bez startowania razem z Windowsem
powershell -ExecutionPolicy Bypass -File deploy\windows\install-foodify.ps1 -NoAutostart

# z kluczem Gemini (włącza generowanie przepisów przez AI)
powershell -ExecutionPolicy Bypass -File deploy\windows\install-foodify.ps1 -GeminiKey "klucz"
```

Instalator można puszczać wielokrotnie — **nigdy nie kasuje bazy**, więc plan
posiłków i swipe'y przeżyją aktualizację. Żeby zaktualizować aplikację: pobierz
nowy ZIP, rozpakuj **na to samo miejsce**, odpal `INSTALUJ.bat`.

## To osobna kopia

Ta instalacja ma **własną bazę** — własny plan posiłków i własny profil smaku.
Nie synchronizuje się z żadnym innym komputerem.
