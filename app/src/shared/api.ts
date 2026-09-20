// The complete surface the renderer may call. Each milestone adds named,
// typed functions here (backed by zod-validated IPC in main), never a
// generic "send any channel" escape hatch.
export type RendererApi = Record<string, never>
