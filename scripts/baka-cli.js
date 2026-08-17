#!/usr/bin/env node

/**
 * Baka TOOLS 命令行批量模式。
 *
 * 用法示例：
 *   node scripts/baka-cli.js remove-background --input D:\images --output D:\out
 *   node scripts/baka-cli.js transparent --input D:\images --output D:\out --color #ffffff
 *   node scripts/baka-cli.js edit --input D:\images --output D:\out --resize 1024x1024 --rotate 90 --grayscale
 *   node scripts/baka-cli.js similar --input D:\images --threshold 8
 *   node scripts/baka-cli.js bad-scan --input D:\images
 */

const fs = require('fs')
const path = require('path')
const {
  editImage,
  findSimilarImages,
  removeBackground,
  replaceTransparentBackground,
  scanBadImages,
} = require('../electron/ipc/image-tools.js')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

function collectImages(inputPath) {
  if (!inputPath) return []
  if (fs.statSync(inputPath).isFile()) return [inputPath]
  const results = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(fullPath)
    }
  }
  walk(inputPath)
  return results.sort()
}

function outputPathFor(inputPath, outputDir, suffix) {
  const ext = path.extname(inputPath)
  const filename = `${path.basename(inputPath, ext)}${suffix}${ext}`
  return path.join(outputDir, filename)
}

function parseResize(value) {
  if (!value || value === 'true') return {}
  const [width, height] = String(value).toLowerCase().split('x').map((part) => parseInt(part, 10))
  return { width: Number.isFinite(width) ? width : undefined, height: Number.isFinite(height) ? height : undefined }
}

async function processBatch(inputPaths, outputDir, suffix, processor) {
  let success = 0
  let failed = 0
  for (const inputPath of inputPaths) {
    try {
      await processor(inputPath, outputPathFor(inputPath, outputDir, suffix))
      success++
      console.log(`✓ ${path.basename(inputPath)}`)
    } catch (error) {
      failed++
      console.error(`✗ ${path.basename(inputPath)}: ${error.message}`)
    }
  }
  return { success, failed }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!command || command === 'help' || args.help) {
    console.log(`Baka TOOLS CLI

命令：
  remove-background  移除统一背景
  transparent        把透明背景替换为纯色
  edit               批量编辑图片
  similar            查找相似图片
  bad-scan           扫描坏图

通用参数：
  --input <文件或文件夹>
  --output <输出文件夹>
  --help
`)
    return
  }

  if (!args.input) {
    throw new Error('缺少 --input 参数')
  }

  const inputPaths = collectImages(args.input)
  if (!inputPaths.length) {
    throw new Error('没有找到图片')
  }
  console.log(`找到 ${inputPaths.length} 张图片`)

  if (command === 'similar') {
    const result = await findSimilarImages(inputPaths, { threshold: Number(args.threshold ?? 8) })
    console.log(`扫描 ${result.compared} 张，找到 ${result.groups.length} 组相似图`)
    result.groups.forEach((group, index) => {
      console.log(`\n相似组 ${index + 1}:`)
      group.forEach((item) => console.log(`  - ${item.path}`))
    })
    return
  }

  if (command === 'bad-scan') {
    const results = await scanBadImages(inputPaths)
    const bad = results.filter((item) => item.status === 'bad')
    console.log(`扫描 ${results.length} 张，${bad.length} 张有问题`)
    for (const item of bad) {
      console.log(`✗ ${item.path}`)
      console.log(`    ${item.issues.join('、') || '无法读取'}`)
    }
    return
  }

  const outputDir = args.output
  if (!outputDir) {
    throw new Error('此命令需要 --output 输出文件夹')
  }
  fs.mkdirSync(outputDir, { recursive: true })

  let result
  if (command === 'remove-background') {
    result = await processBatch(inputPaths, outputDir, '-bg-removed', (inputPath, outputPath) =>
      removeBackground(inputPath, { tolerance: Number(args.tolerance ?? 45), feather: Number(args.feather ?? 2), outputPath })
    )
  } else if (command === 'transparent') {
    result = await processBatch(inputPaths, outputDir, '-flat', (inputPath, outputPath) =>
      replaceTransparentBackground(inputPath, { color: args.color || '#ffffff', outputPath })
    )
  } else if (command === 'edit') {
    const resize = parseResize(args.resize)
    const operation = {
      resize,
      rotate: args.rotate ? Number(args.rotate) : undefined,
      flip: Boolean(args.flip),
      flop: Boolean(args.flop),
      grayscale: Boolean(args.grayscale),
      modulate: {
        brightness: args.brightness ? Number(args.brightness) : 1,
        saturation: args.saturation ? Number(args.saturation) : 1,
      },
    }
    result = await processBatch(inputPaths, outputDir, '-edited', (inputPath, outputPath) =>
      editImage(inputPath, operation, outputPath)
    )
  } else {
    throw new Error(`未知命令：${command}`)
  }

  console.log(`\n完成：成功 ${result.success} 张，失败 ${result.failed} 张`)
}

main().catch((error) => {
  console.error(`\n执行失败：${error.message}`)
  process.exitCode = 1
})
