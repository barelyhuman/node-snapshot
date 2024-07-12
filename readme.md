# node-snapshot

a quick and dirty wrapper around node test context for snapshot testing

**Beginners, this is not for you. **

Enthusiatic developers who like to play around with things, **this is for
you**!!

> [!NOTE:] This package is **ESM** only

### Installation

```sh
; npm install -D @barelyhuman/node-snapshot
```

### Usage

```js
import { test } from 'node:test'
import { snapshot } from '@barelyhuman/node-snapshot'

test('foo', t => {
  snapshot(t, 'bar')

  t.test('foo bar', t => {
    snapshot(t, [{ foo: 'bar' }])
  })
})
```

### LICENSE

[MIT](/LICENSE)
