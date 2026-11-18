# JAKARTA — Streets of the Afternoon

An original 3D open-world crime game in Jakarta at golden hour, built for the
[make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). Mara Voss returns
home to save her brother's bengkel. Explore a 9×9-grid city on foot and by
car — Monas, Wisma 46, Bundaran HI, Sudirman towers, a kampung district, the
Ciliwung river, GBK stadium — with traffic (TransJakarta buses, angkot,
bajaj, taxis), 64 pedestrians, kaki lima vendors, a wanted system with police
cars and a helicopter, 5 story jobs plus taxi/delivery gigs, a CJ-style
arsenal, an economy in rupiah, day-night weather, procedural Indonesian
radio, and a save system.

Everything is original: the city, characters, story, art and music are made
for this game. Nothing from Rockstar Games or any other commercial game.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD move · mouse drag camera · E enter/exit car · F attack/fire · R reload ·
1–4 weapons · M start a story job · Q change radio · V change weather ·
Esc pause. Click **MULAI BARU** on the title screen to start.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node <kit>/cli/makefun.mjs check --kit <kit> --repo .
```

## Tech

Three.js r160 vendored under `game/vendor/`, no build step, no network
requests — the game is plain static files under `game/`. All sound is
procedural WebAudio; all textures are procedural canvas art.

## License

MIT — see [LICENSE](LICENSE).
