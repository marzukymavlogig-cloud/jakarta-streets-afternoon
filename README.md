[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/gta6-01)
[![gta6-01](https://make.fun/bounty/gta6-01/badge.svg)](https://make.fun/bounty/gta6-01)
[![Play the game](https://make.fun/play.svg)](https://marzukymavlogig-cloud.github.io/jakarta-streets-afternoon/game/)

# JAKARTA — Streets of the Afternoon

An original 3D open-world crime game set in Jakarta at golden hour, built
for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) ("Make
GTA 6"). No Rockstar names, characters, map, or assets — everything here is
its own: the city, the story, the art, the sound, and the music.

Mara Voss returns to Jakarta to save her brother's bengkel. Explore a
9×9-grid city (~700 m) on foot or by car: Monas at the centre of Lapangan
Merdeka, the curved glass Wisma 46 tower, the Bundaran HI fountain, Sudirman
glass towers, ruko shophouses, a kampung district with corrugated houses and
laundry lines, the Kali Ciliwung river, Gelora Bung Karno stadium, Tanjung
Priok, Mangga Dua, Pantai Ancol, and Hotel Melati.

## What's in the game

- **A living city** — 29 traffic cars (sedans, TransJakarta buses, angkot,
  bajaj, taxis, food trucks), 64 pedestrians (44 roaming + a Monas crowd),
  13 vendor stalls (bakso, nasi goreng, sate ayam, gorengan, es teh…) plus
  walking sellers, ojol hijau riders, honking, traffic lights, neon signs,
  and billboards.
- **Real faces** — every character has eyes, brows, nose, and mouth; Mara is
  distinct with lipstick and lashes; hijab, caps, glasses, and moustaches
  vary across the crowd. Smooth capsule people with bending knees and
  counter-swinging arms.
- **A solid city** — ~225 colliders: buildings, towers, kampung houses, the
  Monas base, and stalls are solid for feet, cars, peds, and cops, who slide
  along walls instead of passing through. Bumps give a thud, camera shake,
  sparks, and damage.
- **Wanted 0–5 stars** — PD cars ram you, a helicopter hunts you at 3+
  stars, busted/wasted with fines. Story missions are forgiving (slower
  cops, longer bust timer).
- **Five story jobs** — Pulang Kampung, First Fare, The Package, Dustline
  Heist (steal the gold Comet), Sunset Run — with generous timers, plus
  repeatable taxi and delivery gigs.
- **An arsenal** — pistol, SMG, shotgun, rifle (keys 1–4, R reload, F or
  mouse to fire, drive-by from the car), 11 ammo crates, and a weapon-slots
  HUD row.
- **Rupiah economy** — start at Rp250.000, earn mission rewards, buy cars
  at the Mangga Dua dealership, save in localStorage.
- **Golden hour** — shader sky dome, ACES tone mapping, long PCFSoft
  shadows, wet-road puddles, day-night cycle, rain and fog, and three
  procedural Indonesian radio stations (WebAudio synth) with DJ chatter.
- **HUD** — cash, health, wanted stars, speed, clock, weather, radio,
  objective with a mission progress bar, dialogue subtitles with a speaker
  portrait, and a circular minimap.

## Run it

```sh
node serve.ts --port 8080
# then open http://localhost:8080
```

No build step, no network request: `game/` is plain static files and
three.js r160 is vendored under `game/vendor/`. Node 22+ and a desktop
browser (Chrome) are all you need.

## Controls

| Key | Action |
| --- | --- |
| WASD | Walk / drive (Shift to run) |
| Mouse drag | Camera |
| E | Enter / exit a car, buy at the dealer |
| F / click | Punch / fire (hold for auto weapons) |
| R | Reload |
| 1–4 | Pistol / SMG / Shotgun / Senapan |
| M | Start the next story mission |
| Q | Change radio station |
| Space | Handbrake |
| Esc | Pause / save |

## Screenshots

Real renders of the game's own code: the title over golden-hour Jakarta,
driving down Jl. Sudirman, a 4-star police chase, and Mara's face close-up
(`screenshots/`).

## License

MIT — see [LICENSE](LICENSE).
