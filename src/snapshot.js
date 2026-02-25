import { diffTrimmedLines } from 'diff'
import k from 'kleur'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, plugins as prettyFormatPlugins } from 'pretty-format'

const ADDED = k.green
const REMOVED = k.red

const require = createRequire(import.meta.url)
const CURRENT_FILE = fileURLToPath(import.meta.url)

function normalizeStackPath(pathname) {
  if (pathname.startsWith('file://')) {
    let normalizedPath = fileURLToPath(pathname)
    if (process.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/^\\/, '')
    }
    return normalizedPath
  }
  return pathname
}

function parseStackFrame(stackLine) {
  const line = stackLine.trim()
  if (!line.startsWith('at ')) {
    return
  }

  const withParens = line.match(/\((.*)\)$/)
  const location = withParens
    ? withParens[1]
    : line.replace(/^at\s+/, '').split(/\s+/).at(-1)

  if (!location) {
    return
  }

  const locationMatch = location.match(/^(.*):(\d+):(\d+)$/)
  if (!locationMatch) {
    return
  }

  const [, rawFilename, lineNumber, colNumber] = locationMatch
  return {
    filename: normalizeStackPath(rawFilename),
    line: lineNumber,
    col: colNumber,
  }
}

function getFileName() {
  const err = new Error()
  if (!err.stack) {
    return
  }

  const stackFrames = err.stack
    .split('\n')
    .map(parseStackFrame)
    .filter(Boolean)

  const snapshotFrameIndex = stackFrames.findIndex(
    frame => frame.filename === CURRENT_FILE
  )

  let callerFrame
  if (snapshotFrameIndex > -1) {
    callerFrame = stackFrames
      .slice(snapshotFrameIndex + 1)
      .find(frame => frame.filename !== CURRENT_FILE)
  }

  if (!callerFrame) {
    callerFrame = stackFrames.find(
      frame =>
        frame.filename !== CURRENT_FILE &&
        !frame.filename.startsWith('node:internal')
    )
  }

  if (!callerFrame) {
    return
  }

  return callerFrame
}

let fileTestCounter = new Map()

function getFileCounterKey(filename, testName) {
  return `${filename}:${testName}`
}

export function snapshot(
  test,
  currentValue,
  errorMsg = 'Snapshot does not match'
) {
  const hasFileDetails = getFileName()
  const shouldUpdate = () => Number(process.env.UPDATE_SNAPSHOTS) === 1

  if (!hasFileDetails) return

  const { filename } = hasFileDetails
  const snapshotFileName = join(
    'snapshots',
    relative(process.cwd(), filename.replace(extname(filename), '.snap.cjs'))
  )
  let snapshotName = test.name
  if (test.fullName) {
    snapshotName = test.fullName
  } else if (test.name) {
    snapshotName = test.name
  }

  const fileCounterKey = getFileCounterKey(filename, test.fullName ?? test.name)
  if (!fileTestCounter.has(fileCounterKey)) {
    fileTestCounter.set(fileCounterKey, 0)
  }

  const currentCount = fileTestCounter.get(fileCounterKey)
  snapshotName += ' ' + (Number(currentCount) + 1)
  fileTestCounter.set(fileCounterKey, Number(currentCount) + 1)

  if (shouldUpdate()) {
    writeSnapshot(currentValue, snapshotFileName, snapshotName)
    return
  }

  if (existsSync(snapshotFileName)) {
    const module = require(join(process.cwd(), snapshotFileName))
    if (module[snapshotName]) {
      const _diff = diffTrimmedLines(
        formatValue(currentValue).replace(/\\\`/g, '`'),
        module[snapshotName]
      )
      const hasChanges = _diff.filter(d => d.added || d.removed)
      if (hasChanges.length) {
        let changeText = k.reset('\n')
        _diff.forEach(d => {
          if (d.added) {
            changeText += `${ADDED('expected')} ${d.value}`.trimEnd() + '\n'
          } else if (d.removed) {
            changeText += `${REMOVED('received')} ${d.value}`.trimEnd() + '\n'
          } else {
            changeText += d.value.trimEnd() + '\n'
          }
        })

        test.diagnostic(changeText)
        throw new Error(errorMsg)
      }
    } else {
      throw new Error(
        `Snapshot doesn't exist for \`${snapshotName}\`, please run the test command with UPDATE_SNAPSHOTS=1`
      )
    }
  }
}

function writeSnapshot(value, file, name) {
  if (!existsSync(file)) {
    let data = ''
    data += '\n\n'
    data += `exports[${JSON.stringify(name)}] = \`${formatValue(value)}\``
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data, 'utf8')
    return
  }
  const module = require(join(process.cwd(), file))
  module[name] = formatValue(value)
  let newContent = ''
  Object.keys(module).forEach(exp => {
    newContent += `exports[${JSON.stringify(exp)}] = \`${module[exp]}\`\n\n`
  })
  writeFileSync(file, newContent, 'utf8')
}

function formatValue(value) {
  const {
    DOMCollection,
    DOMElement,
    Immutable,
    ReactElement,
    ReactTestComponent,
    AsymmetricMatcher,
  } = prettyFormatPlugins
  return normalizeNewlines(
    format(value, {
      escapeRegex: true,
      indent: 2,
      escapeString: false,
      plugins: [
        DOMCollection,
        DOMElement,
        Immutable,
        ReactElement,
        ReactTestComponent,
        AsymmetricMatcher,
      ],
    })
  ).replaceAll(/[`]/g, '\\`')
}

function normalizeNewlines(str) {
  return str.replaceAll(/\r\n|\r/g, '\n')
}
