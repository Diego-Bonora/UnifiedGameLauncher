// The one place the app's public name lives. electron-builder.yml can't import
// TypeScript, so its `productName` must be kept equal to this by hand.
export const APP_NAME = 'UnifiedGameLauncher'

// Windows uses this to group taskbar icons and match shortcuts. It must equal
// `appId` in electron-builder.yml, and must never change after the first release.
export const APP_ID = 'io.github.diego-bonora.unifiedgamelauncher'

// The project page shown in About. Main copies exactly this to the clipboard
// (the window can't choose what is copied), and no page is ever opened from
// the app (docs/features/release.md, section 1).
export const PROJECT_URL = 'https://github.com/Diego-Bonora/UnifiedGameLauncher'
