# node-snapshot

> A minimal Jest like snapshot testing helper for node:test

> [!NOTE]
>
> This library is now ESM ONLY (since v1.0.0), use v0 if you wish to stick to
> CJS

> [!NOTE]  
> The Library is under active development and might have bugs and issues, please
> report them at
> [barelyhuman/node-snapshot#issues](https://github.com/barelyhuman/node-snapshot/issues)
> to help mature the library

> [!IMPORTANT]  
> The author of the library is trying to be a full time open source maintainer
> and your support would be greatly appreciated. You can find out how by reading
> the following [reaper.is/supporters](https://reaper.is/supporters)

### Installation

```sh
; npm install -D @barelyhuman/node-snapshot
```

### Usage

```js
// ESM
import { test } from 'node:test'
import { snapshot } from '@barelyhuman/node-snapshot'

test('foo', t => {
  snapshot(t, 'bar')

  t.test('foo bar', t => {
    snapshot(t, [{ foo: 'bar' }])
  })
})
```

- Snapshots are stored at `<rootDir>/snapshots` and should be checked into your
  version control. This isn't configurable right now but will soon be.
- Snapshots can be updated by setting `UPDATE_SNAPSHOTS` environment variable to
  `1` before running the test suite

```sh
# example
UPDATE_SNAPSHOTS=1 npm run test
```

### Links

- [mcollina/snap](http://github.com/mcollina/snap) - Alternative to this package
- [snapshot Testing](https://jestjs.io/docs/snapshot-testing) - If you wish to
  learn more about snapshot testing

### LICENSE

[MIT](/LICENSE)
