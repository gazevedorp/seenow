import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import {
  buildTechnicalPrompt,
  productToInput,
  surfaceLabel,
  type InpaintingResultMeta,
  type SegmentationMeta,
  type Surface,
} from "@seenow/shared"
import { toast } from "sonner"
import { cn } from "cn"
import { BeforeAfterSlider } from "@/components/compare/BeforeAfterSlider"
import { GenerationHistoryList } from "@/components/history/GenerationHistoryList"
import { MaskEditor } from "@/components/mask/MaskEditor"
import { ProductPicker } from "@/components/catalog/ProductPicker"
import { SurfaceSelector } from "@/components/surfaces/SurfaceSelector"
import { EnvironmentUploader } from "@/components/upload/EnvironmentUploader"
import { Button } from "@/components/ui/button"
import { findProduct } from "@/lib/catalog"
import { getBlob, keys, putBlob, studioDb, useStudio } from "@/lib/db"
import { delay, formatBrl, formatPercent, providerLabel } from "@/lib/format"
import { blobToCanvas, canvasToBlob, fileToWorkingCanvas } from "@/lib/images"
import { createInpaintingAdapter } from "@/lib/inpainting/create-adapter"
import { maskCoverage } from "@/lib/mask"
import { segmentRoom } from "@/lib/segmentation/segment-room"
import { renderSampleRoom } from "@/lib/sample-room"
import { useObjectUrl } from "@/lib/use-object-url"
import { useGenerationThumbs } from "@/lib/use-generation-media"
import { useTitle } from "@/lib/use-title"

const STEPS = [
  { id: "photo", label: "Foto" },
  { id: "surface", label: "Superfície" },
  { id: "mask", label: "Região" },
  { id: "product", label: "Produto" },
  { id: "result", label: "Resultado" },
] as const

type StepId = (typeof STEPS)[number]["id"]

export function SimulatePage() {
  const { projectId = "" } = useParams()
  const location = useLocation()
  const studio = useStudio()
  const project = studio.projects.find((item) => item.id === projectId)
  const client = studio.clients.find((item) => item.id === project?.clientId)
  const generations = useMemo(
    () =>
      studio.generations.filter(
        (item) => item.projectId === projectId && item.status === "SUCCEEDED",
      ),
    [studio.generations, projectId],
  )

  const [step, setStep] = useState<StepId>("photo")
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const previewUrl = useObjectUrl(previewBlob)
  const [surface, setSurface] = useState<Surface | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [mask, setMask] = useState<Uint8Array | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [segmenting, setSegmenting] = useState(false)
  const [segmentNote, setSegmentNote] = useState<string | null>(null)
  const [segmentMeta, setSegmentMeta] = useState<SegmentationMeta | null>(null)
  const [aiLabel, setAiLabel] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [beforeBlob, setBeforeBlob] = useState<Blob | null>(null)
  const [meta, setMeta] = useState<InpaintingResultMeta | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(true)
  const booted = useRef(false)
  const segmentToken = useRef(0)
  const adapterChoice = useMemo(() => createInpaintingAdapter(), [])
  const resultUrl = useObjectUrl(resultBlob)
  const beforeUrl = useObjectUrl(beforeBlob)
  const thumbs = useGenerationThumbs(generations)
  const product = productId ? findProduct(productId) : undefined
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
    const requested = (location.state as { start?: StepId } | null)?.start
    if (!canvas) {
      setStep("photo")
      return
    }
    if (requested === "photo" || requested === "surface" || requested === "product" || requested === "mask") {
      setStep(requested === "photo" ? "photo" : requested)
      return
    }
    setStep("surface")
  }, [photoLoading, canvas, studio.ready, location.state])

  useEffect(() => {
    let cancelled = false
    void fetch("/api/ai-status")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { segmentation?: { label?: string }; inpainting?: { label?: string } } | null) => {
        if (cancelled || !payload) return
        const parts = [payload.segmentation?.label, payload.inpainting?.label].filter(Boolean)
        setAiLabel(parts.join(" · "))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (step !== "result" || resultBlob || generations.length === 0) return
    void showSaved(generations[0]!.id)
    // showSaved reads the latest list when the result step opens without a fresh render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function storeCanvas(next: HTMLCanvasElement, note: string) {
    const blob = await canvasToBlob(next)
    setCanvas(next)
    setPreviewBlob(blob)
    setPhotoNote(note)
    segmentToken.current += 1
    setMask(null)
    setConfirmed(false)
    setSegmenting(false)
    setSegmentNote(null)
    setSegmentMeta(null)
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

  async function ensureSegment(nextSurface: Surface, source: HTMLCanvasElement, fresh = false) {
    const token = ++segmentToken.current
    setSegmenting(true)
    setError(null)
    try {
      const result = await segmentRoom(source, nextSurface, { fresh })
      if (token !== segmentToken.current) return
      setMask(result.mask)
      setSegmentMeta(result.meta)
      setSegmentNote(result.note)
      setConfirmed(maskCoverage(result.mask) >= 0.01)
    } catch (reason) {
      if (token !== segmentToken.current) return
      setError(reason instanceof Error ? reason.message : "Não foi possível marcar a região.")
    } finally {
      if (token === segmentToken.current) setSegmenting(false)
    }
  }

  function chooseSurface(next: Surface) {
    setSurface(next)
    setMask(null)
    setConfirmed(false)
    setSegmentNote(null)
    setSegmentMeta(null)
    setProductId(null)
    setError(null)
    if (canvas) void ensureSegment(next, canvas)
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
    if (!canvas || !surface || !product || !mask || !project || generating) return
    if (!confirmed) {
      setError("Confirme a região antes de gerar.")
      return
    }
    if (maskCoverage(mask) < 0.01) {
      setError("Marque a área que deve mudar.")
      return
    }
    setGenerating(true)
    setError(null)
    try {
      await delay(40)
      const technicalPrompt = buildTechnicalPrompt(surface, productToInput(product))
      const { image, meta: nextMeta } = await adapterChoice.adapter.generate(
        {
          width: canvas.width,
          height: canvas.height,
          surface,
          product: productToInput(product),
          technicalPrompt,
          mask,
        },
        canvas,
      )
      const original = await canvasToBlob(canvas)
      const id = crypto.randomUUID()
      await putBlob(keys.original(id), original)
      await putBlob(keys.result(id), image)
      await studioDb.addGeneration({
        id,
        projectId: project.id,
        surface,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        createdAt: new Date().toISOString(),
        status: "SUCCEEDED",
        provider: nextMeta.provider,
        model: nextMeta.model,
        processingMs: nextMeta.processingMs,
        estimatedCostBrl: nextMeta.estimatedCostBrl,
        technicalPrompt,
      })
      setBeforeBlob(original)
      setResultBlob(image)
      setMeta(nextMeta)
      setActiveId(id)
      setStep("result")
      toast.success("Versão salva no projeto.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A geração falhou.")
    } finally {
      setGenerating(false)
    }
  }

  function goToMask() {
    if (!canvas || !surface) return
    setStep("mask")
    if (!mask && !segmenting) void ensureSegment(surface, canvas)
  }

  function openStep(next: StepId) {
    if (next === "photo") setStep("photo")
    else if (next === "surface" && canvas) setStep("surface")
    else if (next === "mask" && canvas && surface) goToMask()
    else if (next === "product" && canvas && surface && confirmed) setStep("product")
    else if (next === "result" && (resultBlob || generations.length > 0)) setStep("result")
  }

  if (!studio.ready || photoLoading) {
    return <p className="px-4 py-12 text-sm text-muted-foreground">Carregando o ambiente…</p>
  }

  if (!project || !client) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p>Esse projeto não está neste navegador.</p>
        <Button className="mt-4" asChild>
          <Link to="/">Voltar às simulações</Link>
        </Button>
      </main>
    )
  }

  const coverage = mask ? maskCoverage(mask) : 0

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/projetos/${project.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            {client.fullName} · {project.name}
          </Link>
          <h1 className="mt-1 font-display text-4xl tracking-tight">Simulação</h1>
        </div>
        <ol className="flex gap-1 overflow-x-auto">
          {STEPS.map((item, index) => {
            const enabled =
              item.id === "photo" ||
              (item.id === "surface" && Boolean(canvas)) ||
              (item.id === "mask" && Boolean(canvas && surface)) ||
              (item.id === "product" && Boolean(canvas && surface && confirmed)) ||
              (item.id === "result" && Boolean(resultBlob || generations.length > 0))
            return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => openStep(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm whitespace-nowrap disabled:opacity-40",
                  step === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                )}
              >
                <span className="mr-1 tabular-nums">{index + 1}</span>
                {item.label}
              </button>
            </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.75fr)]">
        <section className="relative min-w-0">
          {step === "photo" ? (
            <EnvironmentUploader
              previewUrl={previewUrl}
              dimensions={photoNote}
              onFile={(file) => void onFile(file)}
              onSample={() => void onSample()}
            />
          ) : null}
          {step !== "photo" && step !== "mask" && step !== "result" && previewUrl ? (
            <img src={previewUrl} alt="Ambiente do cliente" className="w-full rounded-2xl bg-muted object-contain" />
          ) : null}
          {step === "mask" && canvas && mask && surface ? (
            <MaskEditor
              source={canvas}
              width={canvas.width}
              height={canvas.height}
              surface={surface}
              mask={mask}
              segmenting={segmenting}
              hint={segmentNote ?? undefined}
              onResegment={() => void ensureSegment(surface, canvas, true)}
              onChange={(next) => {
                setMask(next)
                setConfirmed(false)
              }}
            />
          ) : null}
          {step === "mask" && !mask && previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Ambiente do cliente" className="w-full rounded-2xl bg-muted object-contain" />
              {segmenting ? (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/75 px-6 text-center">
                  <p className="font-display text-3xl">
                    Identificando {surface === "WALL" ? "a parede" : "o piso"}…
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {step === "result" && beforeUrl && resultUrl ? (
            <BeforeAfterSlider before={beforeUrl} after={resultUrl} />
          ) : null}
          {step === "result" && (!beforeUrl || !resultUrl) ? (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              {generations.length === 0 ? "Gere uma versão para comparar." : "Carregando a comparação…"}
            </div>
          ) : null}
          {generating ? (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/80 px-6 text-center">
              <p className="font-display text-3xl">Aplicando o produto só na região marcada…</p>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-auto">
          {step === "photo" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Foto</p>
              <h2 className="font-display text-3xl">Ambiente do cliente</h2>
              <p className="text-sm text-muted-foreground">
                JPEG, PNG ou WEBP até 10 MB. A proporção é mantida e o lado maior não passa de 2048 px.
              </p>
              <Button className="h-11 w-full" disabled={!canvas} onClick={() => setStep("surface")}>
                Continuar
              </Button>
            </>
          ) : null}

          {step === "surface" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Superfície</p>
              <h2 className="font-display text-3xl">O que vai mudar</h2>
              <p className="text-sm text-muted-foreground">
                A região do piso ou da parede é marcada na foto. Não é preciso pintar a área à mão.
              </p>
              <SurfaceSelector value={surface} onChange={chooseSurface} />
              {segmenting ? <p className="text-sm text-muted-foreground">Identificando a região na foto…</p> : null}
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("photo")}>
                  Voltar
                </Button>
                <Button className="h-10 flex-1" disabled={!surface} onClick={goToMask}>
                  Ver região
                </Button>
              </div>
            </>
          ) : null}

          {step === "product" && surface ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Produto</p>
              <h2 className="font-display text-3xl">
                {surface === "FLOOR" ? "Pisos e porcelanatos" : "Tintas e revestimentos"}
              </h2>
              <ProductPicker
                surface={surface}
                selectedId={productId}
                onSelect={(next) => {
                  setProductId(next.id)
                  setError(null)
                }}
              />
              <p className="text-sm text-muted-foreground">
                {formatPercent(coverage)} da foto está na região do {surfaceLabel(surface).toLowerCase()}. A cor entra só aí.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={goToMask}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1 bg-clay text-white hover:bg-clay/90"
                  disabled={!product || !confirmed || generating || coverage < 0.01}
                  onClick={() => void generate()}
                >
                  {generating ? "Gerando…" : "Gerar simulação"}
                </Button>
              </div>
            </>
          ) : null}

          {step === "mask" && surface ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Região</p>
              <h2 className="font-display text-3xl">{surface === "FLOOR" ? "Piso marcado" : "Parede marcada"}</h2>
              <p className="text-sm text-muted-foreground">
                {segmentNote ?? "A região é proposta automaticamente. Ajuste com o pincel só se precisar."}
              </p>
              <p className="text-sm">
                {segmenting && !mask ? "Procurando a região…" : `${formatPercent(coverage)} da imagem marcada.`}
              </p>
              {segmentMeta ? (
                <p className="text-xs text-muted-foreground">
                  {providerLabel(segmentMeta.provider)} · {segmentMeta.model}
                </p>
              ) : null}
              {aiLabel ? <p className="text-xs text-muted-foreground">{aiLabel}</p> : null}
              {confirmed ? (
                <p className="text-sm text-pine">Região pronta. Pode seguir para o produto.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {mask ? "Confirme a região ajustada antes de gerar." : "Aguarde a marcação automática."}
                </p>
              )}
              {adapterChoice.notice ? <p className="text-xs text-muted-foreground">{adapterChoice.notice}</p> : null}
              {!confirmed ? (
                <Button
                  type="button"
                  className="h-10 w-full bg-pine text-white hover:bg-pine/90"
                  disabled={segmenting || coverage < 0.01}
                  onClick={() => {
                    setConfirmed(true)
                    setError(null)
                  }}
                >
                  Confirmar região
                </Button>
              ) : null}
              {product ? (
                <Button
                  type="button"
                  className="h-11 w-full bg-clay text-white hover:bg-clay/90"
                  disabled={!confirmed || generating || coverage < 0.01}
                  onClick={() => void generate()}
                >
                  {generating ? "Gerando…" : "Gerar simulação"}
                </Button>
              ) : (
                <Button className="h-11 w-full" disabled={!confirmed || segmenting || coverage < 0.01} onClick={() => setStep("product")}>
                  Escolher produto
                </Button>
              )}
              <Button variant="outline" className="h-10 w-full" onClick={() => setStep("surface")}>
                Trocar superfície
              </Button>
            </>
          ) : null}

          {step === "result" ? (
            <>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Resultado</p>
              <h2 className="font-display text-3xl">Antes e depois</h2>
              {meta ? (
                <p className="text-xs text-muted-foreground">
                  {providerLabel(meta.provider)} · {meta.model} · {meta.processingMs} ms ·{" "}
                  {formatBrl(meta.estimatedCostBrl)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Arraste o controle para comparar.</p>
              )}
              {meta ? (
                <details className="text-sm">
                  <summary className="cursor-pointer">Prompt técnico</summary>
                  <p className="mt-2 text-muted-foreground">{meta.technicalPrompt}</p>
                </details>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10" onClick={() => setStep("product")}>
                  Trocar produto
                </Button>
                <Button variant="outline" className="h-10" onClick={goToMask}>
                  Ajustar região
                </Button>
                <Button className="h-10" asChild>
                  <Link to={`/projetos/${project.id}`}>Ver histórico</Link>
                </Button>
              </div>
              <GenerationHistoryList
                items={generations}
                thumbs={thumbs}
                activeId={activeId}
                onSelect={(id) => void showSaved(id)}
              />
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  )
}
