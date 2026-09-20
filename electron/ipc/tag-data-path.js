/**
 * 标签数据文件（resources/tag-data/*.csv）的定位。
 * 开发态：仓库 resources/tag-data；打包后：extraResources 拷到 process.resourcesPath/tag-data。
 * 之前所有调用方都写死了 __dirname/../../resources/tag-data，打包后找不到文件，
 * 中文搜标签 / 角色父子表在安装版里悄悄失效 —— 统一从这里取。
 */
const fs = require('fs')
const path = require('path')

function tagDataDir() {
  const candidates = []
  try {
    // 仅在 Electron 主进程可用；测试环境下 require('electron') 可能没有 app
    const { app } = require('electron')
    if (app?.isPackaged && process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'tag-data'))
  } catch (_) { /* 非 Electron 环境 */ }
  candidates.push(path.join(__dirname, '..', '..', 'resources', 'tag-data'))
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[candidates.length - 1]
}

function tagDataPath(fileName) {
  return path.join(tagDataDir(), fileName)
}

module.exports = { tagDataDir, tagDataPath }
