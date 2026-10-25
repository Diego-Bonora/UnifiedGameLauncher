import { describe, expect, it } from 'vitest'
import { sourceFilesIn } from './check-packaged-app.mjs'

describe('sourceFilesIn', () => {
  it('finds a root-level src folder, with either separator', () => {
    expect(sourceFilesIn(['/src', '/src/main/index.ts', '\\src\\main\\index.ts'])).toEqual([
      '/src',
      '/src/main/index.ts',
      '\\src\\main\\index.ts'
    ])
  })

  it("ignores dependencies' own src folders and look-alike names", () => {
    const paths = ['/node_modules/zod/src/index.ts', '/out/main/index.js', '/srcmap.json']
    expect(sourceFilesIn(paths)).toEqual([])
  })
})
