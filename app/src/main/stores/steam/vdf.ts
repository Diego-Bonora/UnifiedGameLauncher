// Minimal parser for Valve's KeyValues ("VDF") text format, used by both
// libraryfolders.vdf and appmanifest_<id>.acf. Handles quoted strings (with
// \" and \\ escapes, since Windows paths contain backslashes), {} nesting,
// and // line comments. Not a general VDF parser (no #include, no arrays) —
// just enough for the files Steam actually writes.
export type VdfValue = string | VdfObject
export type VdfObject = { [key: string]: VdfValue }

type Token = { type: 'string'; value: string } | { type: '{' } | { type: '}' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const char = text[i]

    if (char === undefined) break

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i++
      continue
    }

    if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }

    if (char === '{') {
      tokens.push({ type: '{' })
      i++
      continue
    }

    if (char === '}') {
      tokens.push({ type: '}' })
      i++
      continue
    }

    if (char === '"') {
      i++
      let value = ''
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          value += text[i + 1]
          i += 2
        } else {
          value += text[i]
          i++
        }
      }
      i++ // closing quote
      tokens.push({ type: 'string', value })
      continue
    }

    // Unquoted junk (shouldn't appear in real Steam files) — skip one char
    // rather than looping forever on it.
    i++
  }
  return tokens
}

function parseObject(tokens: Token[], pos: { i: number }): VdfObject {
  const obj: VdfObject = {}
  while (pos.i < tokens.length) {
    const keyToken = tokens[pos.i]
    if (keyToken === undefined || keyToken.type === '}') {
      pos.i++
      return obj
    }
    if (keyToken.type !== 'string') {
      pos.i++
      continue
    }
    pos.i++

    const valueToken = tokens[pos.i]
    if (valueToken === undefined) return obj

    if (valueToken.type === 'string') {
      obj[keyToken.value] = valueToken.value
      pos.i++
    } else if (valueToken.type === '{') {
      pos.i++
      obj[keyToken.value] = parseObject(tokens, pos)
    } else {
      // A '}' where a value was expected: malformed input, stop here.
      return obj
    }
  }
  return obj
}

export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text)
  const pos = { i: 0 }
  return parseObject(tokens, pos)
}
