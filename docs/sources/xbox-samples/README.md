# Xbox samples (real, captured 2026-10-15 on the user's Windows 11 PC)

Captured with read-only PowerShell commands for the v2 Xbox store spec (@docs/features/xbox-store.md). Use these shapes for fixtures; don't build on guesses (lessons.md).

- `MicrosoftGame.config.minecraft-launcher.xml`: verbatim `C:\XboxGames\Minecraft Launcher\Content\MicrosoftGame.config` (on disk the name is `MicrosoftGame.Config`).
- `GamingRoot.C.bin`: the 28 bytes of `C:\.GamingRoot`, rebuilt from its hex dump: `52 47 42 58 01 00 00 00 58 00 62 00 6F 00 78 00 47 00 61 00 6D 00 65 00 73 00 00 00` ("RGBX", count 1, "XboxGames" UTF-16LE + zero).
- `C:\XboxGames` held: `GameSave` (not a game), `Minecraft for Windows`, `Minecraft Launcher`, `Minecraft- Java Edition`, `Roblox`, `Ultimate Chicken Horse`.
- `Content` folder of Minecraft Launcher (first 15 entries): `appxmanifest.xml`, `gamelaunchhelper.exe`, `GraphicsLogo.png`, `layout_<guid>.xml`, `libHttpClient.GDK.dll`, `MicrosoftGame.Config`, `Minecraft.exe`, `resources.pri`, several `SmallLogo.*.png`. Picking `Minecraft.exe` in a file dialog gives a Windows permission error.
- `Get-StartApps`: Name `Minecraft Launcher`, AppID `Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft`.
- Store catalog, `GET https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9PGW18NPBZV5&market=US&languages=en-US` (no key): `ProductTitle` "Minecraft Launcher"; images (`ImagePurpose` Width x Height): Logo 300x300, BoxArt 2160x2160, TitledHeroArt 1920x1080, BrandedKeyArt 584x800, Poster 1440x2160, SuperHeroArt 3840x2160, 13 Screenshots. Each `Uri` starts with `//store-images.s-microsoft.com/image/apps...` (no scheme).
- `explorer.exe "shell:AppsFolder\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft"` (PowerShell) opened Minecraft Launcher.
