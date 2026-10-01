import { useEffect, useId, useRef, useState } from "react"
import { ImagePlusIcon } from "lucide-react"
import { MAX_LONG_EDGE_PX } from "@seenow/shared"
import { cn } from "cn"
import { validateEnvironmentFile } from "@/lib/images"

export function Dropzone({
  previewUrl,
  onFile,
  onReject,
  inputId: inputIdProp,
}: {
  previewUrl: string | null
  onFile: (file: File) => void
  onReject?: (message: string) => void
  inputId?: string
}) {
  const generatedId = useId()
  const inputId = inputIdProp ?? generatedId
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const takeRef = useRef<(file: File | undefined) => void>(() => undefined)

  function take(file: File | undefined) {
    if (!file) return
    const problem = validateEnvironmentFile(file)
    if (problem) {
      setLocalError(problem)
      onReject?.(problem)
      return
    }
    setLocalError(null)
    onFile(file)
  }

  useEffect(() => {
    takeRef.current = take
  })

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"))
      if (!file) return
      event.preventDefault()
      takeRef.current(file)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          take(event.dataTransfer.files[0])
        }}
        className={cn(
          "grid min-h-72 cursor-pointer place-items-center rounded-2xl border border-dashed bg-card px-6 py-8 text-center transition-colors",
          dragging ? "border-pine bg-secondary" : "border-input hover:border-pine/70 hover:bg-secondary/50",
        )}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Foto do ambiente" className="max-h-[28rem] w-full rounded-xl object-contain" />
        ) : (
          <span className="max-w-sm">
            <ImagePlusIcon className="mx-auto size-8 text-muted-foreground" />
            <span className="mt-3 block font-display text-3xl">Solte a foto do ambiente</span>
            <span className="mt-2 block text-sm text-muted-foreground">
              JPEG, PNG ou WEBP, até 10 MB. O lado maior fica em {MAX_LONG_EDGE_PX} px. Você também pode colar com Ctrl+V.
            </span>
          </span>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            take(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </label>
      {localError ? (
        <p role="alert" className="text-sm text-destructive">
          {localError}
        </p>
      ) : null}
    </div>
  )
}
