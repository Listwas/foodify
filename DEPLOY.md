# Wdrożenie

Cel: Foodify chodzi sam z siebie na PC (start przy bootowaniu, restart po
crashu), a telefon dostaje się do niego z dowolnej sieci — bez płatnego
hostingu i bez wystawiania domowej sieci na świat.

Wszystkie komendy z `sudo` musisz odpalić sam — wymagają hasła do systemu
i zalogowania na Twoje konto Tailscale.

---

## 1. Autostart (systemd)

Plik usługi jest gotowy w repo: [`deploy/foodify.service`](deploy/foodify.service).
Ma już wpisanego usera `ben` i ścieżki `/home/ben/code/foodify`.

Najpierw zbuduj frontend (backend serwuje właśnie ten build):

```bash
cd /home/ben/code/foodify/frontend && npm run build
```

Potem zainstaluj usługę:

```bash
sudo cp /home/ben/code/foodify/deploy/foodify.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now foodify
```

Sprawdzenie:

```bash
systemctl status foodify
journalctl -u foodify -f          # logi na żywo
curl -s localhost:8000/api/recipes | head -c 100
```

Ważne: jeśli wcześniej odpalałeś uvicorn ręcznie, ubij go najpierw — inaczej
port 8000 będzie zajęty i usługa wpadnie w restart loop (`journalctl` pokaże
`address already in use`).

Po każdej zmianie w kodzie:

```bash
cd /home/ben/code/foodify/frontend && npm run build
sudo systemctl restart foodify
```

---

## 2. Dostęp z każdej sieci (Tailscale)

Tailscale robi prywatny VPN między Twoimi urządzeniami. Telefon widzi PC-ta po
stałym adresie z dowolnego internetu, bez przekierowania portów i bez
wystawiania czegokolwiek publicznie.

Na PC:

```bash
# Arch / CachyOS
sudo pacman -S tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
```

`tailscale up` wypisze link — otwórz go i zaloguj się (może być konto Google/
GitHub, nie trzeba nowego hasła). Plan Personal jest darmowy i obejmuje do
6 użytkowników z nieograniczoną liczbą urządzeń, więc dwie osoby to nie problem.

Potem sprawdź adres PC-ta:

```bash
tailscale ip -4        # np. 100.101.102.103
tailscale status
```

Na jej telefonie: zainstaluj apkę Tailscale (App Store / Google Play), zaloguj
się **na to samo konto** i tyle. Wchodzi na:

```
http://<tailscale-ip>:8000
```

Jeśli włączysz MagicDNS w panelu Tailscale, zadziała też ładniejsze
`http://<nazwa-maszyny>:8000`.

**Ograniczenie, o którym trzeba wiedzieć:** działa tylko gdy PC jest włączony.
Jak komputer śpi, apka jest niedostępna. Żeby działało zawsze, potrzebny byłby
prawdziwy hosting w chmurze — osobny, większy temat, na razie niepotrzebny.

### Alternatywa bez VPN-a na telefonie

Jeśli nie chcesz instalować Tailscale u niej na telefonie:

```bash
tailscale funnel 8000
```

wystawia apkę pod publicznym adresem `https://...ts.net`. Wygodniejsze, ale
**apka nie ma żadnego logowania** — każdy z linkiem zobaczy Wasz plan posiłków.
Przy Funnelu warto najpierw dorobić logowanie (schemat ma już `user_id` wszędzie,
więc to dołożenie, nie przepisywanie).

---

## 3. Instalacja na telefonie (PWA)

Aplikacja jest instalowalna — dostaje ikonę na ekranie głównym i odpala się na
pełnym ekranie, bez paska przeglądarki.

- **Android / Chrome**: wejdź na adres → menu ⋮ → *Zainstaluj aplikację*
  (albo sam wyskoczy baner)
- **iPhone / Safari**: wejdź na adres → *Udostępnij* → *Do ekranu początkowego*

Zdjęcia potraw są cache'owane przez service workera, więc po pierwszym wejściu
apka ładuje się szybciej i mniej zjada transferu. Same dane (plan, przepisy)
zawsze idą z sieci, żeby nie pokazywać nieaktualnego planu.

---

## 4. Baza danych

Baza to jeden plik: `backend/foodify.db` (jest w `.gitignore`, nie trafia na
GitHuba). Backup = skopiowanie pliku:

```bash
cp /home/ben/code/foodify/backend/foodify.db ~/foodify-backup-$(date +%F).db
```

Świeża instalacja startuje z pustą bazą — trzeba raz odpalić seed:

```bash
cd /home/ben/code/foodify/backend
.venv/bin/python seed.py
```

Skrypt jest idempotentny, można go puszczać wielokrotnie. Dociąga też brakujące
makra, więc jak dzienny limit Gemini go utnie, wystarczy odpalić następnego dnia.
