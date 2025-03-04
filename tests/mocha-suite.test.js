import { describe, it } from 'node:test'
import { snapshot } from '../src/snapshot.js'

describe('yo', () => {
  it('should yo', ctx => {
    snapshot(ctx, 'make it rain')
  })
})

describe('yo 2', () => {
  it('it yo 2', ctx => {
    snapshot(ctx, { name: 3 })
    snapshot(ctx, { name: 1 })
  })
})

describe('for', () => {
  it('lols', ctx => {
    snapshot(ctx, [{ name: 1 }, { name: 2 }])
  })
})

describe('arrays', () => {
  it('should handle empty arrays', ctx => {
    snapshot(ctx, [])
  })

  it('should handle nested arrays', ctx => {
    snapshot(ctx, [
      [1, 2],
      [3, 4],
    ])
  })
})

describe('objects', () => {
  it('should handle nested objects', ctx => {
    snapshot(ctx, {
      user: {
        name: 'test',
        profile: {
          age: 25,
        },
      },
    })
  })

  it('should handle null values', ctx => {
    snapshot(ctx, { value: null })
  })
})

describe('primitives', () => {
  it('should handle numbers', ctx => {
    snapshot(ctx, 42)
  })

  it('should handle booleans', ctx => {
    snapshot(ctx, true)
    snapshot(ctx, false)
  })
})
