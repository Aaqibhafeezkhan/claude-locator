declare module 'launch-editor' {
  /** `file` may end in `:line` or `:line:column`. */
  export default function launchEditor(
    file: string,
    specifiedEditor?: string,
    onErrorCallback?: (fileName: string, errorMessage: string | null) => void,
  ): void
}
