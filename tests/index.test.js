import { test } from 'node:test'
import { snapshot } from '../src/snapshot.js'

test('array test', t => {
  snapshot(t, [1, 2, 3, 4, 5])
})

test('nested objects', t => {
  snapshot(t, {
    user: {
      name: 'John',
      address: {
        street: '123 Main St',
        city: 'Somewhere',
      },
    },
  })
})

test('mixed types', t => {
  snapshot(t, {
    string: 'hello',
    number: 42,
    boolean: true,
    array: [1, 'two', false],
    null: null,
  })
})

test('nested tests', t => {
  t.test('level 1', t => {
    t.test('level 2', t => {
      snapshot(t, 'nested three levels deep')
    })
  })
})

test('multiline string', t => {
  snapshot(
    t,
    `
    function example() {
      console.log('hello');
      return true;
    }
  `
  )
})

test('special characters', t => {
  snapshot(t, 'Special chars: ©®™€£¥§π∆')
})
