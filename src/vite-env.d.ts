/// <reference types="vite/client" />
/// <reference types="chrome" />

// Raw markdown imports (the bundled LinkedIn skill prompt is loaded this way).
declare module '*.md?raw' {
  const content: string
  export default content
}
