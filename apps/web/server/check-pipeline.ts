import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CATALOG } from "../../../packages/shared/src/catalog.ts"
import {
  applyHomography,
  homographyFromPoints,
  invert3x3,
  quadFromMask,
} from "../../../packages/shared/src/geometry.ts"
import { relightTexture, softLight } from "../../../packages/shared/src/lighting.ts"
import {
  assessSurfaceMask,
  combineRoomMasks,
  edgeBand,
  maskCoverage,
} from "../../../packages/shared/src/mask-ops.ts"
import {
  ADE20K,
  FAL_FLUX_FILL,
  REPLICATE_FLUX_FILL,
  REPLICATE_SEGFORMER,
  SEGFORMER_B5,
  buildFluxPolishPrompt,
  resolvePremiumProviders,
} from "../../../packages/shared/src/premium.ts"
import { groupSegmentItems } from "./hf.ts"
import { ProviderRequestError } from "./retry.ts"
import { clearReplicateVersionCache, replicatePredict } from "./replicate.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
let failed = 0

function test(name: string, run: () => void) {
  try {
    run()
    console.log(`ok ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(error)
  }
}

test("ADE20K floor and wall class ids", () => {
  assert.equal(ADE20K.wall, 0)
  assert.equal(ADE20K.floor, 3)
  assert.equal(ADE20K.ceiling, 5)
})

test("homography roundtrip", () => {
  const source = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  const destination = [
    { x: 4, y: 8 },
    { x: 30, y: 6 },
    { x: 26, y: 40 },
    { x: 2, y: 36 },
  ]
  const matrix = homographyFromPoints(source, destination)
  const inverse = invert3x3(matrix)
  for (let index = 0; index < 4; index++) {
    const forward = applyHomography(matrix, source[index]!)
    const back = applyHomography(inverse, destination[index]!)
    assert.ok(Math.abs(forward.x - destination[index]!.x) < 1e-4)
    assert.ok(Math.abs(forward.y - destination[index]!.y) < 1e-4)
    assert.ok(Math.abs(back.x - source[index]!.x) < 1e-4)
    assert.ok(Math.abs(back.y - source[index]!.y) < 1e-4)
  }
})

test("quad follows a floor trapezoid", () => {
  const width = 120
  const height = 100
  const mask = new Uint8Array(width * height)
  for (let y = 50; y < 100; y++) {
    const inset = Math.round((99 - y) * 0.25)
    for (let x = inset; x < width - inset; x++) mask[y * width + x] = 255
  }
  const fitted = quadFromMask(mask, width, height)
  assert.ok(fitted)
  assert.ok(fitted.yFar < 60)
  assert.ok(fitted.yNear > 90)
  assert.ok(fitted.quad[0].x > fitted.quad[3].x)
  assert.ok(fitted.quad[1].x < fitted.quad[2].x)
})

test("room masks keep floor, rug and wall, drop ceiling and specks", () => {
  const width = 80
  const height = 60
  const length = width * height
  const floor = new Uint8Array(length)
  const wall = new Uint8Array(length)
  const ceiling = new Uint8Array(length)
  const rug = new Uint8Array(length)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < width; x++) ceiling[y * width + x] = 255
  }
  for (let y = 8; y < 34; y++) {
    for (let x = 0; x < width; x++) wall[y * width + x] = 255
  }
  for (let y = 36; y < 58; y++) {
    for (let x = 4; x < 76; x++) floor[y * width + x] = 255
  }
  for (let y = 44; y < 52; y++) {
    for (let x = 20; x < 40; x++) rug[y * width + x] = 255
  }
  wall[2] = 255
  const combined = combineRoomMasks({ floor, wall, ceiling, rug, width, height })
  assert.equal(combined.floor[46 * width + 24], 255)
  assert.equal(combined.floor[40 * width + 10], 255)
  assert.equal(combined.wall[20 * width + 10], 255)
  assert.equal(combined.wall[4 * width + 10], 0)
  assert.equal(combined.wall[2], 0)
  assert.ok(maskCoverage(combined.floor) > 0.1)
  assert.equal(assessSurfaceMask(combined.floor).failed, false)
})

test("edge band stays off the interior", () => {
  const width = 40
  const height = 40
  const mask = new Uint8Array(width * height)
  mask.fill(255)
  const band = edgeBand(mask, width, height, 3)
  assert.equal(band[20 * width + 20], 0)
  assert.equal(band[1 * width + 1], 255)
})

test("shadows stay darker than the mask average", () => {
  const shadow = relightTexture(200, 40, 160)
  const mid = relightTexture(200, 160, 160)
  assert.ok(shadow < mid)
  assert.ok(Math.abs(softLight(0.4, 0.5) - 0.4) < 1e-9)
})

test("resolver uses SegFormer and Flux, never a color heuristic", () => {
  const secret = "hf_secret_should_not_leak"
  const hugging = resolvePremiumProviders({
    hfToken: secret,
    replicateToken: "",
    falKey: "fal-key",
    openaiKey: "",
  })
  assert.equal(JSON.stringify(hugging).includes(secret), false)
  assert.equal(hugging.segmentation.provider, "huggingface")
  assert.equal(hugging.segmentation.model, SEGFORMER_B5)
  assert.equal(hugging.segmentation.configured, true)
  assert.equal(hugging.polish.provider, "fal")
  assert.equal(hugging.polish.model, FAL_FLUX_FILL)
  assert.equal(hugging.material.model, "perspective-warp-v1")
  assert.equal(hugging.depth.configured, true)

  const replicateOnly = resolvePremiumProviders({
    hfToken: "",
    replicateToken: "r8_test",
    falKey: "",
    openaiKey: "sk-test",
  })
  assert.equal(JSON.stringify(replicateOnly).includes("r8_test"), false)
  assert.equal(JSON.stringify(replicateOnly).includes("sk-test"), false)
  assert.equal(replicateOnly.segmentation.provider, "replicate")
  assert.equal(replicateOnly.segmentation.model, REPLICATE_SEGFORMER)
  assert.equal(replicateOnly.polish.provider, "replicate")
  assert.equal(replicateOnly.polish.model, REPLICATE_FLUX_FILL)
  assert.equal(replicateOnly.sam.configured, true)
  assert.equal(replicateOnly.openaiUnused, true)
  assert.equal(replicateOnly.depth.configured, false)

  const openaiOnly = resolvePremiumProviders({
    hfToken: "",
    replicateToken: "",
    falKey: "",
    openaiKey: "sk-test",
  })
  assert.equal(openaiOnly.segmentation.configured, false)
  assert.equal(openaiOnly.polish.configured, false)
  assert.equal(openaiOnly.openaiUnused, true)
  const dumped = JSON.stringify(openaiOnly)
  assert.equal(dumped.includes("room-color"), false)
  assert.equal(dumped.includes("heuristic"), false)
  assert.equal(dumped.includes("gpt-image"), false)

  const forcedOff = resolvePremiumProviders({
    hfToken: "hf_present",
    replicateToken: "r8_present",
    falKey: "fal",
    openaiKey: "",
    segmentationProvider: "off",
    polishProvider: "off",
  })
  assert.equal(forcedOff.segmentation.configured, false)
  assert.equal(forcedOff.polish.configured, false)
})

test("flux prompt names the catalog sku and keeps it", () => {
  const prompt = buildFluxPolishPrompt({
    name: "Laminado carvalho claro",
    finish: "Acetinado",
    dimensions: "19 × 120 cm",
    surface: "FLOOR",
  })
  assert.ok(prompt.includes("Laminado carvalho claro"))
  assert.ok(prompt.toLowerCase().includes("catalog"))
  assert.ok(prompt.toLowerCase().includes("do not invent"))
})

test("segformer labels map onto floor wall ceiling and rug", () => {
  const grouped = groupSegmentItems([
    { label: "floor", mask: "QUJD" },
    { label: "wall", mask: "data:image/png;base64,REVG" },
    { label: "rug", mask: "R1JF" },
    { label: "ceiling", mask: "Q0VM" },
    { label: "sofa", mask: "U09G" },
  ])
  assert.deepEqual(grouped.floor, ["QUJD"])
  assert.deepEqual(grouped.wall, ["REVG"])
  assert.deepEqual(grouped.rug, ["R1JF"])
  assert.deepEqual(grouped.ceiling, ["Q0VM"])
})

test("catalog ships floor and wall textures", () => {
  assert.ok(CATALOG.length >= 9)
  const surfaces = new Set(CATALOG.map((product) => product.surface))
  assert.ok(surfaces.has("FLOOR"))
  assert.ok(surfaces.has("WALL"))
  for (const product of CATALOG) {
    assert.ok(product.textureUrl.startsWith("/textures/"))
    assert.ok(product.tileScale > 0)
    const file = resolve(root, "apps/web/public" + product.textureUrl)
    assert.ok(existsSync(file), file)
  }
})

const OLDER = "a".repeat(64)
const NEWER = "b".repeat(64)
const COMMUNITY = "simbrams/segformer-b5-finetuned-ade-640-640"

type FetchCall = { url: string; method: string; body: unknown; prefer: string | null }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function withFetch(handler: (call: FetchCall) => Response | Promise<Response>, run: (calls: FetchCall[]) => Promise<void>) {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null
    const call = { url, method, body, prefer: headers.get("Prefer") }
    calls.push(call)
    return handler(call)
  }
  try {
    clearReplicateVersionCache()
    await run(calls)
  } finally {
    globalThis.fetch = original
    clearReplicateVersionCache()
  }
}

function succeeded(output: unknown = { ok: true }): Response {
  return jsonResponse(200, { id: "pred_1", status: "succeeded", output })
}

await (async () => {
  try {
    await withFetch(
      (call) => {
        if (call.url.endsWith("/versions") && call.method === "GET") {
          return jsonResponse(200, {
            results: [
              { id: OLDER, created_at: "2024-01-01T00:00:00.000Z" },
              { id: NEWER, created_at: "2025-06-01T00:00:00.000Z" },
            ],
          })
        }
        if (call.url === "https://api.replicate.com/v1/predictions" && call.method === "POST") return succeeded()
        return jsonResponse(500, { detail: `unexpected ${call.method} ${call.url}` })
      },
      async (calls) => {
        const output = await replicatePredict("r8_test", COMMUNITY, { image: "data:image/png;base64,QQ==" })
        assert.deepEqual(output, { ok: true })
        assert.equal(
          calls.some((call) => /\/models\/.+\/predictions$/.test(call.url)),
          false,
        )
        const post = calls.find((call) => call.method === "POST")
        assert.equal(post?.url, "https://api.replicate.com/v1/predictions")
        assert.equal(post?.prefer, "wait=60")
        assert.deepEqual(post?.body, {
          version: `${COMMUNITY}:${NEWER}`,
          input: { image: "data:image/png;base64,QQ==" },
        })
        const before = calls.length
        await replicatePredict("r8_test", COMMUNITY, { image: "again" })
        const extra = calls.slice(before)
        assert.equal(extra.some((call) => call.url.endsWith("/versions")), false)
        assert.equal(extra.length, 1)
        assert.equal(extra[0]?.url, "https://api.replicate.com/v1/predictions")
      },
    )
    console.log("ok community replicate predictions use the latest version id")
  } catch (error) {
    failed += 1
    console.error("FAIL community replicate predictions use the latest version id")
    console.error(error)
  }

  try {
    await withFetch(
      (call) => {
        if (call.url.endsWith("/versions")) return jsonResponse(500, { detail: "versions should be skipped" })
        if (call.method === "POST") return succeeded("pinned")
        return jsonResponse(500, { detail: "unexpected" })
      },
      async (calls) => {
        const pin = `${COMMUNITY}:${OLDER}`
        const output = await replicatePredict("r8_test", pin, { image: "x" })
        assert.equal(output, "pinned")
        assert.equal(calls.length, 1)
        const post = calls[0]
        assert.ok(post)
        assert.deepEqual((post.body as { version?: string }).version, pin)
      },
    )
    console.log("ok pinned replicate version skips the versions list")
  } catch (error) {
    failed += 1
    console.error("FAIL pinned replicate version skips the versions list")
    console.error(error)
  }

  try {
    await withFetch(
      (call) => {
        if (call.url.endsWith("/versions")) return jsonResponse(200, { results: [] })
        if (call.method === "POST") return succeeded("official")
        return jsonResponse(500, { detail: "unexpected" })
      },
      async (calls) => {
        const output = await replicatePredict("r8_test", "black-forest-labs/flux-fill-pro", { prompt: "seam" })
        assert.equal(output, "official")
        const post = calls.find((call) => call.method === "POST")
        assert.ok(post)
        assert.equal(post.url, "https://api.replicate.com/v1/predictions")
        assert.deepEqual((post.body as { version?: string }).version, "black-forest-labs/flux-fill-pro")
        const before = calls.length
        await replicatePredict("r8_test", "black-forest-labs/flux-fill-pro", { prompt: "again" })
        assert.equal(calls.slice(before).some((call) => call.url.endsWith("/versions")), false)
      },
    )
    console.log("ok official replicate models post owner/name")
  } catch (error) {
    failed += 1
    console.error("FAIL official replicate models post owner/name")
    console.error(error)
  }

  try {
    await withFetch(
      (call) => {
        if (call.url.endsWith("/versions")) return jsonResponse(404, { detail: "Not found" })
        if (call.method === "POST") return jsonResponse(404, { detail: "The requested resource could not be found." })
        return jsonResponse(500, { detail: "unexpected" })
      },
      async (calls) => {
        await assert.rejects(
          () => replicatePredict("r8_test", COMMUNITY, { image: "x" }),
          (error: unknown) => {
            assert.ok(error instanceof ProviderRequestError)
            assert.equal(error.status, 404)
            assert.equal(error.retryable, false)
            assert.ok(error.message.includes(COMMUNITY), error.message)
            assert.ok(error.message.includes("versão"), error.message)
            return true
          },
        )
        assert.equal(
          calls.some((call) => /\/models\/.+\/predictions$/.test(call.url)),
          false,
        )
      },
    )
    console.log("ok missing replicate model names the model id")
  } catch (error) {
    failed += 1
    console.error("FAIL missing replicate model names the model id")
    console.error(error)
  }

  try {
    await withFetch(
      (call) => {
        if (call.url.endsWith("/versions")) {
          return jsonResponse(200, { results: [{ id: NEWER, created_at: "2025-01-01T00:00:00.000Z" }] })
        }
        if (call.method === "POST") {
          return jsonResponse(200, {
            id: "pred_wait",
            status: "processing",
            urls: { get: "https://api.replicate.com/v1/predictions/pred_wait" },
          })
        }
        if (call.url === "https://api.replicate.com/v1/predictions/pred_wait") {
          return jsonResponse(200, { id: "pred_wait", status: "succeeded", output: "polled" })
        }
        return jsonResponse(500, { detail: "unexpected" })
      },
      async (calls) => {
        const output = await replicatePredict("r8_test", COMMUNITY, { image: "x" })
        assert.equal(output, "polled")
        const post = calls.find((call) => call.method === "POST")
        assert.ok(post)
        assert.equal(post.prefer, "wait=60")
        assert.equal(
          calls.some((call) => call.url === "https://api.replicate.com/v1/predictions/pred_wait"),
          true,
        )
      },
    )
    console.log("ok replicate keeps wait and polls while the prediction is running")
  } catch (error) {
    failed += 1
    console.error("FAIL replicate keeps wait and polls while the prediction is running")
    console.error(error)
  }
})()

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log("all passed")
