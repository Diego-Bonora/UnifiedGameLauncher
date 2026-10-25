// electron-builder afterPack hook (electron-builder.yml): fails the build when
// source files were packed into app.asar. It runs after the app folder is
// packed and before the installer is made, so on a tag build a bad package
// stops the run before anything is uploaded, and the app.asar checked is the
// one the installer then carries. Runs on local builds too.
import { join } from 'node:path'
// A devDependency pinned to the exact version app-builder-lib packs app.asar
// with (it pins it too), so npm keeps one copy; move both together.
import asar from '@electron/asar'

// Only a root-level /src (or \src on Windows) counts, since dependencies may
// legitimately contain their own src folders.
export function sourceFilesIn(paths) {
  return paths.filter((path) => /^[/\\]src([/\\]|$)/.test(path))
}

export default function checkPackagedApp(context) {
  const archive = join(context.appOutDir, 'resources', 'app.asar')
  const found = sourceFilesIn(asar.listPackage(archive, { isPack: false }))
  if (found.length > 0) {
    throw new Error(`src/** was packaged into app.asar:\n${found.join('\n')}`)
  }
}
