const { describe, it } = require('node:test')
const { snapshot } = require('../src/snapshot.js')

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
