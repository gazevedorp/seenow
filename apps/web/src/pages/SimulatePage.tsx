import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import {
  GEOMETRIC_MASK_MODEL,
  PERSPECTIVE_WARP_MODEL,
  surfaceLabel,
  type InpaintingResultMeta,
  type Surface,
} from "@seenow/shared"
import { BeforeAfterSlider } from "@/components/compare/BeforeAfterSlider"
import { GenerationHistoryList } from "@/components/history/GenerationHistoryList"
import { MaskEditor } from "@/components/mask/MaskEditor"
import { MaskOverlay } from "@/components/mask/MaskOverlay"
import { ProductCommand } from "@/components/catalog/ProductCommand"
import { ProductPicker } from "@/components/catalog/ProductPicker"
import { SelectionPreview } from "@/components/catalog/SelectionPreview"
import { useProductCommand } from "@/components/catalog/use-product-command"
import { EnvironmentUploader } from "@/components/upload/EnvironmentUploader"
import { SurfaceToggle } from "@/components/surfaces/SurfaceToggle"
import { PhotoStepError, PhotoStepLoading } from "@/components/workspace/PhotoStep"
import { StepRail, type RailState } from "@/components/workspace/StepRail"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { notify } from "@/lib/notify"
import { findProduct } from "@/lib/catalog"
import { getBlob, keys, putBlob, studioDb, useStudio } from "@/lib/db"
import { formatBrl, formatPercent, providerLabel } from "@/lib/format"
import { blobToCanvas, canvasToBlob, fileToWorkingCanvas } from "@/lib/images"
import { autoMask, maskCoverage } from "@/lib/mask"
import { detectRoom, renderPreview, usePipelineStatus, type MaskSource } from "@/lib/pipeline/api"
import { renderSampleRoom } from "@/lib/sample-room"
import { useObjectUrl } from "@/lib/use-object-url"
import { useGenerationThumbs } from "@/lib/use-generation-media"
import { useTitle } from "@/lib/use-title"

const STEPS = [
  { id: "photo", label: "Foto" },
  { id: "surface", label: "Superfície" },
  { id: "product", label: "Produto" },
  { id: "mask", label: "Máscara" },
  { id: "result", label: "Resultado" },
] as const

type StepId = (typeof STEPS)[number]["id"]

function normalizeStart(value: string | undefined): StepId | null {
  if (value === "detect" || value === "surface") return "surface"
  if (value === "mask") return "mask"
  if (value === "preview" || value === "result") return "result"
  if (value === "photo" || value === "product") return value
  return null
}

export function SimulatePage() {
  const { projectId = "" } = useParams()
  const location = useLocation()
  const studio = useStudio()
  const pipeline = usePipelineStatus()
  const project = studio.projects.find((item) => item.id === projectId)
  const client = studio.clients.find((item) => item.id === project?.clientId)
  const generations = useMemo(
    () =>
      studio.generations.filter((item) => item.projectId === projectId && item.status === "SUCCEEDED"),
    [studio.generations, projectId],
  )

  const [step, setStep] = useState<StepId>("photo")
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const previewUrl = useObjectUrl(previewBlob)
  const [editSurface, setEditSurface] = useState<Surface>("FLOOR")
  const [productId, setProductId] = useState<string | null>(null)
  const [floorMask, setFloorMask] = useState<Uint8Array | null>(null)
  const [wallMask, setWallMask] = useState<Uint8Array | null>(null)
  const [depth, setDepth] = useState<Float32Array | null>(null)
  const [depthModel, setDepthModel] = useState<string | null>(null)
  const [maskSource, setMaskSource] = useState<MaskSource | null>(null)
  const [showMask, setShowMask] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [detectedFor, setDetectedFor] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [phase, setPhase] = useState("Aplicando o material…")
  const [error, setError] = useState<string | null>(null)
  const [polishNote, setPolishNote] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [beforeBlob, setBeforeBlob] = useState<Blob | null>(null)
  const [meta, setMeta] = useState<InpaintingResultMeta | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(true)
  const booted = useRef(false)
  const flight = useRef(false)
  const resultUrl = useObjectUrl(resultBlob)
  const beforeUrl = useObjectUrl(beforeBlob)
  const thumbs = useGenerationThumbs(generations)
  const command = useProductCommand()
  const product = productId ? findProduct(productId) : undefined
  const surface: Surface = editSurface
  const activeMask = surface === "FLOOR" ? floorMask : wallMask
  const photoKey = canvas ? `${projectId}:${canvas.width}x${canvas.height}` : ""
  useTitle(project ? project.name : "Simulação")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const blob = await getBlob(keys.photo(projectId))
      if (cancelled) return
      if (blob) {
        const next = await blobToCanvas(blob)
        if (cancelled) return
        setCanvas(next)
        setPreviewBlob(blob)
        setPhotoNote(`${next.width} × ${next.height} px`)
      }
      setPhotoLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (photoLoading || booted.current || !studio.ready) return
    booted.current = true
    const requested = normalizeStart((location.state as { start?: string } | null)?.start)
    if (!canvas) {
      setStep("photo")
      return
    }
    setStep(requested ?? "surface")
  }, [photoLoading, canvas, studio.ready, location.state])

  useEffect(() => {
    if ((step !== "surface" && step !== "mask") || !canvas || !photoKey || detectedFor === photoKey || flight.current) return
    let cancelled = false
    flight.current = true
    setDetecting(true)
    setDetectError(null)
    void detectRoom(canvas)
      .then((result) => {
        if (cancelled) return
        setFloorMask(result.floor)
        setWallMask(result.wall)
        setDepth(result.depth)
        setDepthModel(result.depthModel)
        setMaskSource(result.source)
        setDetectedFor(photoKey)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setDetectError(reason instanceof Error ? reason.message : "A detecção falhou.")
        setDetectedFor(photoKey)
      })
      .finally(() => {
        flight.current = false
        if (!cancelled) setDetecting(false)
      })
    return () => {
      cancelled = true
      flight.current = false
    }
  }, [step, canvas, photoKey, detectedFor])

  useEffect(() => {
    if (step !== "result" || resultBlob || generations.length === 0) return
    void showSaved(generations[0]!.id)
    // showSaved reads the latest list when the preview opens without a fresh render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function storeCanvas(next: HTMLCanvasElement, note: string) {
    const blob = await canvasToBlob(next)
    setCanvas(next)
    setPreviewBlob(blob)
    setPhotoNote(note)
    setFloorMask(null)
    setWallMask(null)
    setDepth(null)
    setDepthModel(null)
    setMaskSource(null)
    setDetectedFor(null)
    setDetectError(null)
    setResultBlob(null)
    setError(null)
    if (project) {
      await putBlob(keys.photo(project.id), blob)
      await studioDb.updateProject(project.id, { hasPhoto: true })
    }
  }

  async function onFile(file: File) {
    try {
      const loaded = await fileToWorkingCanvas(file)
      const resized =
        loaded.originalWidth !== loaded.canvas.width || loaded.originalHeight !== loaded.canvas.height
      const note = resized
        ? `${loaded.originalWidth} × ${loaded.originalHeight} px reduzida para ${loaded.canvas.width} × ${loaded.canvas.height} px`
        : `${loaded.canvas.width} × ${loaded.canvas.height} px`
      await storeCanvas(loaded.canvas, note)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler a foto.")
    }
  }

  async function onSample() {
    try {
      const blob = await renderSampleRoom()
      const next = await blobToCanvas(blob)
      await storeCanvas(next, `${next.width} × ${next.height} px · foto de exemplo`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a foto de exemplo.")
    }
  }

  function applyGeometric() {
    if (!canvas) return
    setFloorMask(autoMask(canvas.width, canvas.height, "FLOOR"))
    setWallMask(autoMask(canvas.width, canvas.height, "WALL"))
    setDepth(null)
    setDepthModel(null)
    setMaskSource({
      provider: "geometric",
      model: GEOMETRIC_MASK_MODEL,
      configured: false,
      note: pipeline?.segmentation.configured
        ? "Recorte geométrico escolhido manualmente. Não é SegFormer."
        : "Recorte geométrico. Não é segmentação SegFormer.",
    })
    setDetectError(null)
    setDetectedFor(photoKey)
  }

  function updateEditedMask(next: Uint8Array) {
    if (editSurface === "FLOOR") setFloorMask(next)
    else setWallMask(next)
  }

  async function showSaved(id: string) {
    const [original, result] = await Promise.all([getBlob(keys.original(id)), getBlob(keys.result(id))])
    const saved = generations.find((item) => item.id === id)
    if (original) setBeforeBlob(original)
    if (result) setResultBlob(result)
    if (saved) {
      setMeta({
        provider: saved.provider,
        model: saved.model,
        processingMs: saved.processingMs,
        estimatedCostBrl: saved.estimatedCostBrl,
        technicalPrompt: saved.technicalPrompt,
        retryCount: 0,
      })
    }
    setActiveId(id)
    setStep("result")
  }

  async function generate() {
    if (!canvas || !product || !floorMask || !wallMask || !project || generating) return
    const appliedSurface = editSurface
    const mask = appliedSurface === "FLOOR" ? floorMask : wallMask
    if (maskCoverage(mask) < 0.01) {
      setError("A máscara desta superfície está vazia.")
      return
    }
    setGenerating(true)
    setError(null)
    setPolishNote(null)
    try {
      const applied = { ...product, surface: appliedSurface }
      const preview = await renderPreview({
        source: canvas,
        mask,
        product: applied,
        depth,
        segmentationProvider: maskSource?.provider ?? "geometric",
        segmentationModel: maskSource?.model ?? GEOMETRIC_MASK_MODEL,
        onPhase: setPhase,
      })
      const original = await canvasToBlob(canvas)
      const id = crypto.randomUUID()
      const technicalPrompt = preview.technicalPrompt
      await putBlob(keys.original(id), original)
      await putBlob(keys.result(id), preview.blob)
      await studioDb.addGeneration({
        id,
        projectId: project.id,
        surface: appliedSurface,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        createdAt: new Date().toISOString(),
        status: "SUCCEEDED",
        provider: preview.provider,
        model: preview.model,
        processingMs: preview.processingMs,
        estimatedCostBrl: preview.estimatedCostBrl,
        technicalPrompt,
      })
      setBeforeBlob(original)
      setResultBlob(preview.blob)
      setPolishNote(preview.polishNote)
      setMeta({
        provider: preview.provider,
        model: preview.model,
        processingMs: preview.processingMs,
        estimatedCostBrl: preview.estimatedCostBrl,
        technicalPrompt,
        retryCount: 0,
      })
      setActiveId(id)
      setShowMask(false)
      setStep("result")
      notify.success("Prévia salva no projeto.")
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "A prévia falhou."
      setError(message)
      notify.error(message)
    } finally {
      setGenerating(false)
    }
  }

  function masksReady() {
    return Boolean(canvas && floorMask && wallMask)
  }

  function openStep(next: StepId) {
    if (next === "photo") setStep("photo")
    else if (next === "surface" && canvas) setStep("surface")
    else if (next === "product" && masksReady()) setStep("product")
    else if (next === "mask" && masksReady()) setStep("mask")
    else if (next === "result" && (resultBlob || generations.length > 0)) setStep("result")
  }

  function chooseProduct(next: { id: string; surface: Surface }) {
    setProductId(next.id)
    setEditSurface(next.surface)
    setError(null)
    if ((step === "photo" || step === "surface") && masksReady()) setStep("product")
  }

  function railState(id: StepId): RailState {
    if (id === step) return "current"
    if (id === "photo") return canvas ? "done" : "upcoming"
    if (id === "surface") return floorMask && wallMask ? "done" : "upcoming"
    if (id === "product") return productId ? "done" : "upcoming"
    if (id === "mask") {
      const done = productId && floorMask && wallMask && (resultBlob || generations.length > 0 || step === "result")
      return done ? "done" : "upcoming"
    }
    return resultBlob || generations.length > 0 ? "done" : "upcoming"
  }

  if (!studio.ready) {
    return <p className="px-4 py-12 text-sm text-muted-foreground">Carregando o ambiente…</p>
  }

  if (!project || !client) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          title="Projeto fora deste navegador"
          description="Esse projeto não está neste navegador."
          action={
            <Button asChild>
              <Link to="/">Voltar às simulações</Link>
            </Button>
          }
        />
      </main>
    )
  }

  const editedMask = editSurface === "FLOOR" ? floorMask : wallMask
  const coverage = activeMask ? maskCoverage(activeMask) : 0

  return (
    <main className="w-full px-4 py-4 lg:px-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="font-display text-3xl tracking-tight">Simulação</h1>
        <StepRail
          steps={STEPS.map((item, index) => ({
            id: item.id,
            label: item.label,
            index: index + 1,
            state: railState(item.id),
            enabled:
              item.id === "photo" ||
              (item.id === "surface" && Boolean(canvas)) ||
              ((item.id === "product" || item.id === "mask") && masksReady()) ||
              (item.id === "result" && Boolean(resultBlob || generations.length > 0)),
            onSelect: () => openStep(item.id),
          }))}
        />
      </div>

      <div className="rounded-3xl border bg-muted/30 p-3 lg:p-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,22rem)]">
        <section className="relative min-w-0 rounded-2xl bg-background p-2 ring-1 ring-foreground/10">
          {step === "photo" && photoLoading ? <PhotoStepLoading /> : null}
          {step === "photo" && !photoLoading ? (
            <div className="space-y-3">
              {!previewUrl && error ? <PhotoStepError message={error} /> : null}
              <EnvironmentUploader
                previewUrl={previewUrl}
                dimensions={photoNote}
                onFile={(file) => void onFile(file)}
                onSample={() => void onSample()}
              />
            </div>
          ) : null}
          {step === "surface" && previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Ambiente do cliente" className="w-full rounded-2xl bg-muted object-contain" />
              {showMask && activeMask && canvas ? (
                <MaskOverlay mask={activeMask} width={canvas.width} height={canvas.height} />
              ) : null}
              {detecting ? (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/80 px-6 text-center">
                  <p className="text-sm text-muted-foreground">Lendo piso e parede…</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {step === "product" && previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Ambiente do cliente" className="w-full rounded-2xl bg-muted object-contain" />
              {showMask && activeMask && canvas ? (
                <MaskOverlay mask={activeMask} width={canvas.width} height={canvas.height} />
              ) : null}
              {product ? <SelectionPreview product={product} /> : null}
            </div>
          ) : null}
          {step === "mask" && canvas && editedMask ? (
            <MaskEditor
              source={canvas}
              width={canvas.width}
              height={canvas.height}
              surface={editSurface}
              mask={editedMask}
              showOverlay={showMask}
              hint={
                maskSource
                  ? `${maskSource.model}. O pincel só ajusta a máscara; não troca o modelo.`
                  : "A detecção ainda não terminou."
              }
              onChange={updateEditedMask}
              onRedetect={() => {
                setDetectedFor(null)
                setDetectError(null)
              }}
              redetectLabel="Detectar de novo"
              onToggleOverlay={() => setShowMask((value) => !value)}
            />
          ) : null}
          {step === "mask" && canvas && !editedMask ? (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              {detecting ? "Lendo piso e parede…" : "A máscara ainda não está pronta."}
            </div>
          ) : null}
          {step === "result" && beforeUrl && resultUrl ? (
            <div className="relative">
              <BeforeAfterSlider before={beforeUrl} after={resultUrl} />
              {showMask && activeMask && canvas ? (
                <MaskOverlay mask={activeMask} width={canvas.width} height={canvas.height} />
              ) : null}
            </div>
          ) : null}
          {step === "result" && (!beforeUrl || !resultUrl) ? (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              {generations.length === 0 ? "Gere uma prévia para comparar." : "Carregando a comparação…"}
            </div>
          ) : null}
          {generating ? (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/80 px-6 text-center">
              <p className="font-display text-3xl">{phase}</p>
            </div>
          ) : null}
        </section>

        <aside className="flex max-h-[calc(100svh-4.5rem)] min-h-0 flex-col gap-4 overflow-hidden rounded-2xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-14 lg:h-[calc(100svh-4.5rem)]">
          <PipelineSummary
            segmentationModel={
              maskSource?.model ??
              (pipeline?.segmentation.configured
                ? pipeline.segmentation.model
                : "defina HF_TOKEN ou REPLICATE_API_TOKEN")
            }
            segmentationProvider={maskSource?.provider ?? pipeline?.segmentation.provider ?? "unconfigured"}
            polishModel={pipeline?.polish.model ?? "…"}
            polishConfigured={Boolean(pipeline?.polish.configured)}
            depthModel={depthModel}
            openaiUnused={Boolean(pipeline?.openaiUnused)}
            note={maskSource?.note ?? null}
          />
          {step === "mask" ? null : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showMask}
                onChange={(event) => setShowMask(event.target.checked)}
              />
              Máscara de depuração
            </label>
          )}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {step === "photo" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Foto</p>
              <h2 className="font-display text-3xl">Ambiente do cliente</h2>
              <p className="text-sm text-muted-foreground">
                JPEG, PNG ou WEBP até 10 MB. A proporção é mantida e o lado maior não passa de 2048 px.
              </p>
            </>
          ) : null}

          {step === "surface" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Superfície</p>
              <h2 className="font-display text-3xl">Piso e parede</h2>
              <SurfaceToggle
                value={editSurface}
                floorMask={floorMask}
                wallMask={wallMask}
                onChange={setEditSurface}
              />
              {detecting ? <p className="text-sm text-muted-foreground">Consultando o modelo de segmentação…</p> : null}
              {detectError ? <p className="text-sm text-destructive">{detectError}</p> : null}
              <Button type="button" variant="outline" className="h-10 w-full" onClick={applyGeometric}>
                Usar recorte geométrico
              </Button>
              <p className="text-xs text-muted-foreground">
                O recorte geométrico é um trapézio fixo. Ele não é SegFormer e não é apresentado como IA.
              </p>
            </>
          ) : null}

          {step === "product" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Produto</p>
              <h2 className="font-display text-3xl">Catálogo</h2>
              <p className="text-sm text-muted-foreground">
                A superfície segue o SKU. A textura do arquivo entra na máscara, com perspectiva e a luz da foto.
              </p>
              <SurfaceToggle
                value={editSurface}
                floorMask={floorMask}
                wallMask={wallMask}
                onChange={(item) => {
                  setEditSurface(item)
                  if (product && product.surface !== item) setProductId(null)
                  setError(null)
                }}
              />
              <Button type="button" variant="outline" className="h-10 w-full" onClick={() => command.setOpen(true)}>
                Buscar produto · ⌘K
              </Button>
              {product ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {product.sku} · {surfaceLabel(surface)} · {formatPercent(coverage)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {surface === "WALL" ? "Escolha um revestimento de parede." : "Escolha um piso."}
                </p>
              )}
              <ProductPicker
                surface={editSurface}
                selectedId={productId}
                onSelect={chooseProduct}
              />
            </>
          ) : null}

          {step === "mask" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Máscara</p>
              <h2 className="font-display text-3xl">Ajuste fino</h2>
              <p className="text-sm text-muted-foreground">
                O pincel soma área e a borracha tira. A prévia usa a máscara desta superfície.
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {photoNote ?? "sem medida"} · {surfaceLabel(surface)} · {formatPercent(coverage)}
              </p>
            </>
          ) : null}

          {step === "result" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Resultado</p>
              <h2 className="font-display text-3xl">Antes e depois</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {photoNote ?? "—"} · {product?.sku ?? "—"} · {meta ? `${meta.processingMs} ms` : "—"} · {formatPercent(coverage)}
              </p>
              {meta ? (
                <p className="text-xs text-muted-foreground">
                  {providerLabel(meta.provider)} · {meta.model} · {formatBrl(meta.estimatedCostBrl)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Arraste o controle para comparar.</p>
              )}
              {polishNote ? <p className="text-sm text-muted-foreground">{polishNote}</p> : null}
              {meta ? (
                <details className="text-sm">
                  <summary className="cursor-pointer">Prompt do polimento</summary>
                  <p className="mt-2 text-muted-foreground">{meta.technicalPrompt}</p>
                </details>
              ) : null}
              <GenerationHistoryList
                items={generations}
                thumbs={thumbs}
                activeId={activeId}
                onSelect={(id) => void showSaved(id)}
              />
            </>
          ) : null}

          </div>

          {error && step !== "photo" ? (
            <p role="alert" className="shrink-0 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="shrink-0 border-t border-foreground/10 bg-card pt-3">
            {step === "photo" ? (
              <Button className="h-11 w-full" disabled={!canvas || photoLoading} onClick={() => setStep("surface")}>
                Detectar piso e parede
              </Button>
            ) : null}
            {step === "surface" ? (
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("photo")}>
                  Voltar
                </Button>
                <Button
                  className="h-10 flex-1"
                  disabled={!floorMask || !wallMask || detecting}
                  onClick={() => setStep("product")}
                >
                  Escolher produto
                </Button>
              </div>
            ) : null}
            {step === "product" ? (
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("surface")}>
                  Voltar
                </Button>
                <Button className="h-10 flex-1" disabled={!product} onClick={() => setStep("mask")}>
                  Continuar
                </Button>
              </div>
            ) : null}
            {step === "mask" ? (
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("product")}>
                  Voltar
                </Button>
                <Button className="h-10 flex-1" disabled={!product || generating} onClick={() => void generate()}>
                  {generating ? "Gerando…" : "Gerar prévia"}
                </Button>
              </div>
            ) : null}
            {step === "result" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("product")}>
                  Trocar produto
                </Button>
                <Button variant="outline" className="h-10" onClick={() => setStep("mask")}>
                  Ajustar máscara
                </Button>
                <Button className="h-10" asChild>
                  <Link to={`/projetos/${project.id}`}>Ver histórico</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
      </div>
      <ProductCommand
        open={command.open}
        onOpenChange={command.setOpen}
        surface={editSurface}
        onSelect={chooseProduct}
      />
    </main>
  )
}


function PipelineSummary({
  segmentationModel,
  segmentationProvider,
  polishModel,
  polishConfigured,
  depthModel,
  openaiUnused,
  note,
}: {
  segmentationModel: string
  segmentationProvider: string
  polishModel: string
  polishConfigured: boolean
  depthModel: string | null
  openaiUnused: boolean
  note: string | null
}) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        Segmentação: {providerLabel(segmentationProvider)} · {segmentationModel}
      </p>
      <p>Material: {PERSPECTIVE_WARP_MODEL}</p>
      <p>Polimento: {polishConfigured ? polishModel : "Flux Fill não configurado"}</p>
      {depthModel ? <p>Profundidade: {depthModel}</p> : null}
      {openaiUnused ? <p>OPENAI_API_KEY está presente e não entra neste fluxo.</p> : null}
      {note ? <p>{note}</p> : null}
    </div>
  )
}
