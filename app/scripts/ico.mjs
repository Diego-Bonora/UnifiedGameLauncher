// Packs PNG images into a Windows .ico file (docs/features/release.md,
// section 6). Every entry stays PNG-compressed: Windows has read PNG entries
// at any size since Vista, so no bitmap conversion is needed.
//
// Layout: a 6-byte header, one 16-byte directory entry per image, then the
// PNG bytes in the same order.

const HEADER_SIZE = 6
const ENTRY_SIZE = 16
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Reads width and height from the IHDR chunk, which the PNG format requires
// to come first, right after the signature.
export function pngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG image')
  }
  if (png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('PNG has no IHDR chunk first')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

export function buildIco(pngs) {
  if (pngs.length === 0) throw new Error('an icon needs at least one image')
  const sizes = pngs.map(pngSize)
  for (const { width, height } of sizes) {
    // The directory stores each side in one byte, with 0 meaning 256.
    if (width !== height || width < 1 || width > 256) {
      throw new Error(`icon images must be square and at most 256 px, got ${width}x${height}`)
    }
  }

  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = icon (2 would be a cursor)
  header.writeUInt16LE(pngs.length, 4)

  let offset = HEADER_SIZE + ENTRY_SIZE * pngs.length
  const entries = pngs.map((png, i) => {
    const entry = Buffer.alloc(ENTRY_SIZE)
    const side = sizes[i].width === 256 ? 0 : sizes[i].width
    entry.writeUInt8(side, 0)
    entry.writeUInt8(side, 1)
    entry.writeUInt8(0, 2) // no palette
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel (RGBA)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...pngs])
}
