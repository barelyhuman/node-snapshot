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
