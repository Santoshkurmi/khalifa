# Langur Burja (Jhandi Munda / Khorkhore) — LAN party game

A 3D multiplayer version of the Nepali Dashain/Tihar dice game, played over your local Wi-Fi.

## Run

```bash
npm install                            # first time only
HOST_PASSWORD=yourpassword npm start   # optional: PORT=4000
```

If you leave out `HOST_PASSWORD`, a random password is generated and printed in the terminal.

The terminal prints:

- **Host screen**: `http://localhost:3000/host`. Enter the host password to unlock the controls. It works from any device.
- **Player link**: `http://<your-ip>:3000/`, for everyone on the same Wi-Fi. The host screen also shows a QR code.

## How it plays

1. Players open the link, enter a name and pick an avatar. Each player starts with the "Money for new players" amount (default रु 1,000).
2. The host presses **Start Round**, and betting opens (default 20 s timer; set it to 0 to roll manually).
3. Players pick a chip and tap symbols to bet: Jhanda (flag), Burja (crown), Itta (diamond), Paan (heart), Hukum (spade), Chidi (club).
4. Six 3D dice roll. A symbol on **2+ dice** pays the bet × count, and the stake comes back. With 0–1 dice, the bank keeps the bet.
5. Winnings come from, and losses go to, the **house bank** (starts at रु 10,000).

Host tools: auto-play rounds, add or remove bank money, tap a player to give, take or remove them, and reset the game.
Players who refresh or reconnect keep their balance. If the server restarts, everyone starts fresh.
