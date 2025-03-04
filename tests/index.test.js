import { test } from 'node:test'
import { snapshot } from '../src/snapshot.js'

test('yo', t => {
  snapshot(t, 'make it rain')
})

test('yo 2', t => {
  snapshot(t, { name: 3 })
  snapshot(t, { name: 1 })
})

test('for', t => {
  t.test('lols', t => {
    snapshot(t, [{ name: 1 }, { name: 2 }])
  })
})

test('html', t => {
  snapshot(
    t,
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>

</body>
</html>`
  )
})

test('js', t => {
  snapshot(t, 'module.exports = ()=>{return `some-string` }')
})
