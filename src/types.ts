export interface Shot {
  soundMode?: "silent" | "native";
  soundPrompt?: string;
  id: string;
  sceneId: string;
  title: string;
  prompt: string;
  duration: number;
  assetIds: string[];
  camera: string;
  locked?: boolean;
  seed?: number;
}
export interface Asset {
  id: string;
  name: string;
  kind: "character" | "location" | "prop";
  description: string;
}
export interface Plan {
  summary: string;
  assets: Asset[];
  scenes: { id: string; title: string; description: string }[];
  shots: Shot[];
}
export interface Project {
  sampler?: string;
  steps?: number;
  fps?: number;
  id: string;
  name: string;
  script: string;
  style: string;
  version: number;
  aspectRatio: string;
  megapixels: number;
  plan: Plan | null;
  assets: { assetId: string; path: string }[];
  updatedAt: string;
  createdAt: string;
}
export interface Job {
  continuityMessage?: string;
  continuityApplied?: boolean;
  continuitySourceJobId?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  id: string;
  projectId: string;
  shotId: string;
  shot: Shot;
  status: string;
  progress: number;
  output?: string;
  error?: string;
  message?: string;
  promptId?: string;
  createdAt: string;
  cancelRequested?: boolean;
}
export interface Operation {
  projectId?: string;
  id: string;
  kind: string;
  status: string;
  message: string;
  progress: number;
  result?: { path?: string; id?: string; clips?:number; partial?:boolean };
  updatedAt: string;
}
export interface Resource {
  id: string;
  name: string;
  group: string;
  path: string;
  size: number;
  sha256: string;
  url: string;
  license: string;
  source: string;
  revision: string;
}
export interface Preparation {initializing?:boolean;checkedAt:string;planningReady:boolean;videoReady:boolean;exportReady:boolean;backupReady:boolean;inferenceValidated:boolean;items:{id:string;title:string;state:'ready'|'missing'|'blocked'|'unknown';summary:string;details:string[];action:{label:string;page:string;target?:string}}[]}
export interface Download extends Resource {
  status: string;
  completed: number;
  speed: number;
  error?: string;
}
export interface Catalog {
  resources: Resource[];
  directorModels: {
    id: string;
    name: string;
    description: string;
    ramGB: number;
  }[];
  downloads: Download[];
  compatibility: string;
}
export interface Settings {
  comfyUrl: string;
  ollamaUrl: string;
  model: string;
  allowLan: boolean;
  managedComfy: boolean;
  managedOllama: boolean;
  gpuIndex: number;
  lowVram: boolean;
  directorDevice: "auto" | "cpu";
  agentEnabled: boolean;
  agentScopes: string[];
  agentTokenConfigured: boolean;
  firstRun: boolean;
}
export interface Status {
  ollama: {
    online: boolean;
    models: { name: string; size: number }[];
    error?: string;
  };
  comfy: {
    online: boolean;
    error?: string;
    devices?: { name: string; vram_total: number }[];
  };
  managed?: unknown;
  processes: string[];
  install?: Operation;
}
export interface Hardware {
  platform: string;
  arch: string;
  ramGB: number;
  cpu: string;
  gpus: { index: number; name: string; vramMB: number; driver: string }[];
  freeBytes: number;
  recommendedModel: string;
  videoSupport: string;
  dataRoot: string;
  validated: boolean;
}
declare global {
  interface Window {
    nanaDesktop?: {
      openComfy:()=>Promise<void>;
      chooseDataRoot: () => Promise<string | null>;
      openDataRoot: () => Promise<void>;
    };
  }
}
