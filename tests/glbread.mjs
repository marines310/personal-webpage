/**
 * Just enough glTF-binary to get at a model's triangles in Node.
 *
 * Same reason as the PNG reader beside it: the checks that matter are against
 * the real models, and Three.js needs a browser. This reads the JSON chunk,
 * the binary chunk, and pulls out whichever accessors are asked for.
 *
 * It is also the tool that settled the car-size argument - a model's true
 * dimensions are in its POSITION accessor's min and max, and reading them
 * takes a minute where guessing at scale factors took three rounds.
 */
import { readFileSync } from 'fs'

export function readGLB(path) {
  const file = readFileSync(path)
  const chunks = []

  let at = 12                                  // past the header
  while (at < file.length) {
    const length = file.readUInt32LE(at)
    chunks.push({ type: file.readUInt32LE(at + 4), start: at + 8, length })
    at += 8 + length
  }

  const json = JSON.parse(
    file.slice(chunks[0].start, chunks[0].start + chunks[0].length).toString())
  const bin = file.slice(chunks[1].start, chunks[1].start + chunks[1].length)

  const accessor = (index) => {
    const a = json.accessors[index]
    const view = json.bufferViews[a.bufferView]
    const offset = (view.byteOffset || 0) + (a.byteOffset || 0)
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]
    const out = []

    for (let i = 0; i < a.count * size; i++) {
      if (a.componentType === 5126) out.push(bin.readFloatLE(offset + i * 4))
      else if (a.componentType === 5125) out.push(bin.readUInt32LE(offset + i * 4))
      else if (a.componentType === 5123) out.push(bin.readUInt16LE(offset + i * 2))
      else if (a.componentType === 5121) out.push(bin[offset + i])
      else throw new Error(`accessor component type ${a.componentType}`)
    }

    return out
  }

  return { json, accessor }
}

/** Every primitive in the file, as the plain arrays the layout code wants. */
export function primitives(path) {
  const { json, accessor } = readGLB(path)
  const out = []

  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives) {
      out.push({
        position: accessor(p.attributes.POSITION),
        uv: p.attributes.TEXCOORD_0 === undefined
          ? null : accessor(p.attributes.TEXCOORD_0),
        index: accessor(p.indices),
        material: json.materials?.[p.material]
      })
    }
  }

  return out
}
