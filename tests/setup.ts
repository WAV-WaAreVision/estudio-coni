import "@testing-library/jest-dom/vitest"

// jsdom has no layout and no ResizeObserver: nothing it could observe ever changes size.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
