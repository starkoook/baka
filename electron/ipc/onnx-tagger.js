const { scanModels, detectProviders } = require('./tagger-models')

const MODEL_FAMILIES = [
  { id: 'wd14', label: 'WD14', prefix: 'wd-' },
  { id: 'pixai', label: 'PixAI', prefix: 'pixai-' },
  { id: 'cl', label: 'CL Tagger', prefix: 'cl-' },
]

const ONNX_MODEL_CATALOG = [
  { id: 'wd-eva02-large-tagger-v3', familyId: 'wd14', label: 'WD EVA02 Large V3', defaultThreshold: 0.35 },
  { id: 'wd-swinv2-tagger-v3', familyId: 'wd14', label: 'WD SwinV2 V3', defaultThreshold: 0.35 },
  { id: 'wd-convnext-tagger-v3', familyId: 'wd14', label: 'WD ConvNext V3', defaultThreshold: 0.35 },
  { id: 'wd-vit-tagger-v3', familyId: 'wd14', label: 'WD ViT V3', defaultThreshold: 0.35 },
  { id: 'wd-vit-large-tagger-v3', familyId: 'wd14', label: 'WD ViT Large V3', defaultThreshold: 0.35 },
  { id: 'pixai-tagger-v0.9', familyId: 'pixai', label: 'PixAI Tagger 0.9', defaultThreshold: 0.45 },
  { id: 'cl-tagger-v2', familyId: 'cl', label: 'CL Tagger V2', defaultThreshold: 0.35 },
]

function listCatalog(modelDir) {
  const models = scanModels(modelDir)
  return models.map(model => {
    const base = model.name.toLowerCase()
    const family = MODEL_FAMILIES.find(item => base.startsWith(item.prefix)) || { id: 'other', label: 'Other', prefix: '' }
    return { ...model, familyId: family.id, familyLabel: family.label }
  })
}

function listProviders() {
  return detectProviders()
}

function getCatalog() {
  return ONNX_MODEL_CATALOG
}

module.exports = { MODEL_FAMILIES, ONNX_MODEL_CATALOG, listCatalog, listProviders, getCatalog }
