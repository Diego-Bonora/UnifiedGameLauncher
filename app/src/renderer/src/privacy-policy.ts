import { APP_NAME, PROJECT_URL } from '@shared/app-info'

// The in-app privacy policy (docs/features/release.md, section 2). Every
// statement describes what main really does; any change that adds a network
// call or a saved file updates this text, and LAST_UPDATED, in the same
// commit. It is bundled with the app so it reads the same offline.
export const PRIVACY_LAST_UPDATED = '2026-10-17'

// package.json's "name". The installer names the program folder and its
// updater cache after it, not after APP_NAME (electron-builder's per-user
// one-click install). Fixed at the first release, like the appId.
export const PACKAGE_NAME = 'unified-game-launcher'

// A bullet is plain text, or a bold lead followed by text and/or sub-bullets.
export type PolicyItem = string | { lead: string; text?: string; items?: string[] }

export interface PolicySection {
  heading: string
  items: PolicyItem[]
}

export const PRIVACY_INTRO = `${APP_NAME} is a personal, open-source project. It isn't a commercial product and isn't affiliated with Valve, Epic Games, GOG, Ubisoft, Blizzard or Electronic Arts. Everything it keeps stays on your PC.`

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: 'What the app keeps on your PC',
    items: [
      'Your public Steam ID.',
      "Your Steam Web API key and SteamGridDB key, if you add them, encrypted with Windows' built-in protection.",
      'A saved copy of your Steam library (owned games).',
      "Cover images for your games: Steam and Epic covers named by each game's id, and for hand-added games a Steam poster or the icon taken from the .exe.",
      'For Epic covers: the ids of Epic games seen installed, with the date last seen (kept up to 30 days after a game is uninstalled).',
      'The games you add by hand (title, .exe location, launch arguments).',
      'Your favorites and your settings.',
      "A random ID that the update checker creates the first time it checks (a file named .updaterId). It stays the same between checks, so GitHub can tell your checks apart from other installs' checks; it is sent with each update check.",
      'The files Electron, the framework the app is built on, keeps for itself, such as a cache of downloaded cover images and the window settings.',
      'No passwords and no store login tokens. The list of installed games is read fresh each time, not saved.'
    ]
  },
  {
    heading: "Where it's kept",
    items: [
      { lead: 'Your data:', text: `%APPDATA%\\${APP_NAME}` },
      { lead: 'The program:', text: `%LOCALAPPDATA%\\Programs\\${PACKAGE_NAME}` },
      {
        lead: 'A copy of the installer and any downloaded update:',
        text: `%LOCALAPPDATA%\\${PACKAGE_NAME}-updater`
      }
    ]
  },
  {
    heading: 'Who the app talks to',
    items: [
      {
        lead: 'Steam:',
        items: [
          'The sign-in page opens in your own browser, and the app then asks Steam to confirm the sign-in.',
          'The Web API gets your key and Steam ID to read your library.',
          "Steam's store service gets the ids of your installed Steam games (also ones you don't own, like free games) to find their covers.",
          "Steam's image servers send the covers.",
          'Steam\'s store search gets the titles of hand-added games set to "Steam cover". Games set to "Exe icon" send nothing.'
        ]
      },
      {
        lead: 'SteamGridDB:',
        text: 'only if you add a key. It gets your key and the ids of your installed Epic games; its image server sends the covers.'
      },
      {
        lead: 'GitHub:',
        text: 'only while "Check for updates automatically" is on, or when you press Check now. It receives a request for the newest version\'s info, with this install\'s random update ID (see above) and your IP address, like any website, and sends the update files if you choose Download.'
      },
      'These services have their own privacy policies.'
    ]
  },
  {
    heading: 'What the app never does',
    items: [
      "Ask for your passwords. You sign in on Steam's own website.",
      "Send your data to the developer or any server of the developer's.",
      'Include analytics, tracking or ads.'
    ]
  },
  {
    heading: 'How to delete your data',
    items: [
      {
        lead: 'Disconnect Steam',
        text: "in Settings: deletes your Steam ID, your saved Steam library and the covers of games you don't have installed."
      },
      {
        lead: 'Remove',
        text: 'next to each key deletes that key. Covers already saved stay until you delete the data folder.'
      },
      'Remove a hand-added game from its ⋯ menu.',
      'Turn off "Check for updates automatically" in Settings, and the app stops asking GitHub for updates.',
      `Uninstall the app, then delete %APPDATA%\\${APP_NAME} and %LOCALAPPDATA%\\${PACKAGE_NAME}-updater. The uninstaller leaves your data, so your library survives a reinstall.`
    ]
  },
  {
    heading: 'Contact',
    items: [`Open an issue on the project's GitHub page: ${PROJECT_URL}`]
  }
]
