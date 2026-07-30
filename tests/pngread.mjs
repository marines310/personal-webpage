/**
 * Just enough PNG to read the models' texture atlas in Node.
 *
 * The browser hands the pixels over for free (draw to a canvas, getImageData),
 * but the whole point of tests/windows.mjs is to check the window detection
 * against the REAL atlas rather than a stand-in, and that means decoding the
 * file here. Node's zlib does the hard part; the rest is the row filters.
 *
 * Eight-bit RGB or RGBA, no interlacing - which is what these files are.
 */
import { readFileSync } from 'fs'
import { inflateSync } from 'zlib'

export function readPNG(path) {
  const file = readFileSync(path)
  let at = 8                                   // past the signature
  let width = 0, height = 0, depth = 0, colourType = 0
  const data = []

  while (at < file.length) {
    const length = file.readUInt32BE(at)
    const type = file.slice(at + 4, at + 8).toString()

    if (type === 'IHDR') {
      width = file.readUInt32BE(at + 8)
      height = file.readUInt32BE(at + 12)
      depth = file[at + 16]
      colourType = file[at + 17]
    }
    if (type === 'IDAT') data.push(file.slice(at + 8, at + 8 + length))

    at += 12 + length
  }

  if (depth !== 8) throw new Error(`only 8-bit PNGs, this one is ${depth}`)

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType]
  const bpp = channels
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(data))
  const out = Buffer.alloc(height * stride)

  let read = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[read++]
    const line = raw.slice(read, read + stride)
    read += stride

    const row = out.slice(y * stride, (y + 1) * stride)
    const above = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride)

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0
      const b = above[x]
      const c = x >= bpp ? above[x - bpp] : 0
      let value = line[x]

      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }

      row[x] = value & 255
    }
  }

  return { width, height, channels, data: out }
}

/**
 * A sampler in the shape findWindowFaces expects.
 *
 * No V flip: glTF puts UV (0,0) at the top left of the image.
 */
export function samplerFor(image) {
  return (u, v) => {
    const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)))
    const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)))
    const i = (y * image.width + x) * image.channels
    return [image.data[i], image.data[i + 1], image.data[i + 2]]
  }
}
