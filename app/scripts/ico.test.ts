import { describe, expect, it } from 'vitest'
import { buildIco, pngSize } from './ico.mjs'

// The smallest bytes pngSize reads: signature, IHDR length, type, width,
// height. The rest of a real PNG doesn't matter to the .ico container.
function fakePng(width: number, height = width, extra = 0): Buffer {
  const png = Buffer.alloc(24 + extra)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'latin1')
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  return png
}

describe('pngSize', () => {
  it('reads the size from the IHDR chunk', () => {
    expect(pngSize(fakePng(48, 32))).toEqual({ width: 48, height: 32 })
  })

  it('rejects anything that is not a PNG', () => {
    expect(() => pngSize(Buffer.from('<svg></svg>'.padEnd(30)))).toThrow('not a PNG')
  })

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const png = fakePng(16)
    png.write('IDAT', 12, 'latin1')
    expect(() => pngSize(png)).toThrow('no IHDR')
  })
})

describe('buildIco', () => {
  it('writes a header, one entry per image and the PNG bytes after them', () => {
    const small = fakePng(16, 16, 4)
    const large = fakePng(256, 256, 10)
    const ico = buildIco([small, large])

    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)

    const first = 6
    expect(ico.readUInt8(first)).toBe(16)
    expect(ico.readUInt8(first + 1)).toBe(16)
    expect(ico.readUInt16LE(first + 4)).toBe(1)
    expect(ico.readUInt16LE(first + 6)).toBe(32)
    expect(ico.readUInt32LE(first + 8)).toBe(small.length)
    expect(ico.readUInt32LE(first + 12)).toBe(6 + 2 * 16)

    const second = first + 16
    // 256 px doesn't fit in a byte; the format writes 0 for it.
    expect(ico.readUInt8(second)).toBe(0)
    expect(ico.readUInt8(second + 1)).toBe(0)
    expect(ico.readUInt32LE(second + 8)).toBe(large.length)
    expect(ico.readUInt32LE(second + 12)).toBe(6 + 2 * 16 + small.length)

    expect(ico.subarray(38, 38 + small.length).equals(small)).toBe(true)
    expect(ico.subarray(38 + small.length).equals(large)).toBe(true)
  })

  it('refuses images that are not square or are larger than 256 px', () => {
    expect(() => buildIco([fakePng(32, 16)])).toThrow('square')
    expect(() => buildIco([fakePng(512)])).toThrow('at most 256')
  })

  it('refuses an empty list', () => {
    expect(() => buildIco([])).toThrow('at least one')
  })
})
