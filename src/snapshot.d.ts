import { TestContext } from 'node:test'

export function snapshot<T>(
  t: TestContext,
  currentValue: T,
  errorMessage?: string
): void
