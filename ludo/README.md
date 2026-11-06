# Ludo 3D: LAN multiplayer

A 3D Ludo you play with friends on the same Wi-Fi, from phones or laptops. The pieces are cute characters, you drag them around with the mouse or your finger, and there's a garden scene with a cozy night mode.

## Run

```bash
cd ludo
npm install                            # first time only
HOST_PASSWORD=yourpassword npm start   # port 3001 (change with PORT=...)
```

Open the link the terminal prints (`http://<your-ip>:3001/`) on every device.

## Ways to play together

- **Each on their own phone:** everyone opens the link (or scans the QR code from 📱 Invite) and picks a colour.
- **Sharing one device (pass-and-play):** after you sit down, tap **"+ Friend here 📱"** on another colour and enter your friend's name. You take turns on the same screen, and the camera turns to whoever's turn it is.
- **Bots:** fill any empty colour with **+ Bot 🤖**.

If someone disconnects or is idle for 30 s, autoplay takes over until they're back. The host password is only needed to end a game early (☰ menu).

## Controls

| Do this | How |
|---|---|
| Roll | **Grab the dice and flick it**, or tap it / the ROLL button / press Space |
| Move | **Drag your glowing buddy onto the glowing square**, or tap it / press 1–4 |
| Have fun | **Tap any character to poke it.** It giggles, dances or waves, and gets grumpy or dizzy if you overdo it. Pokes show on everyone's screen. |
| Look around | Drag the empty board to rotate, pinch or scroll to zoom. 🎯 resets the view, 🗺️ shows it from the top |
| Mood | 🌙 / ☀️ switches between a sunny garden and a cozy lantern-lit night |

The characters are 🐰 Red bunnies, 🌱 Green sprouts, 🐥 Yellow chicks and 🐱 Blue cats.
