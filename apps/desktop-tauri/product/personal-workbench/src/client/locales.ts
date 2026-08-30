/** Localized copy for the personal-workbench settings card. */

/** Translation keys owned by the settings card. */
export type PersonalWorkbenchKey = keyof typeof zh

/** Simplified Chinese settings copy. */
export const zh = {
  'title': '我的工作台',
  'description': '设置侧边栏名称和 Logo，打造属于你的 Agent 工作台。',
  'preview': '实时预览',
  'name.label': '工作台名称',
  'name.placeholder': '例如：小辉的工作台',
  'logo.label': '工作台 Logo',
  'logo.choose': '选择图片',
  'logo.replace': '更换图片',
  'logo.remove': '移除 Logo',
  'logo.hint': '选择一张你喜欢的图片。',
  'save': '应用到工作台',
  'reset': '恢复 XiaoHui 默认',
  'saved': '已应用',
  'reset.done': '已恢复默认',
  'status.readonly': '当前 Profile 的设置文件不可写。',
  'error.name': '请输入工作台名称。',
  'error.read': '图片读取失败，请重试。',
  'error.save': '保存失败，请检查设置文件后重试。',
  'update.title': '应用更新',
  'update.description': '检查、下载并安装签名的 XiaoHui Harness 最新版本。产品插件会随应用一起更新，安装完成后应用将自动重启。',
  'update.desktop-only': '请在 XiaoHui Harness 桌面应用中使用此功能。',
  'update.action': '检查并更新',
  'update.checking-action': '正在检查…',
  'update.checking': '正在检查更新；如有新版本，将自动下载并安装。',
  'update.shell-unavailable': '桌面更新服务未响应，请重新打开 XiaoHui Harness 后重试。',
  'update.error': '检查更新失败：',
} as const

/** English settings copy. */
export const en: Record<PersonalWorkbenchKey, string> = {
  'title': 'My Workbench',
  'description': 'Choose a sidebar name and logo for your personal Agent workbench.',
  'preview': 'Live preview',
  'name.label': 'Workbench name',
  'name.placeholder': "For example: Avery's Workbench",
  'logo.label': 'Workbench logo',
  'logo.choose': 'Choose image',
  'logo.replace': 'Replace image',
  'logo.remove': 'Remove logo',
  'logo.hint': 'Choose an image you like.',
  'save': 'Apply to workbench',
  'reset': 'Restore XiaoHui default',
  'saved': 'Applied',
  'reset.done': 'Default restored',
  'status.readonly': 'This Profile settings document is read-only.',
  'error.name': 'Enter a workbench name.',
  'error.read': 'The image could not be read. Try again.',
  'error.save': 'Could not save. Check the settings document and try again.',
  'update.title': 'Application updates',
  'update.description': 'Check, download, and install the latest signed XiaoHui Harness release. Product plugins update with the app, which restarts after installation.',
  'update.desktop-only': 'Use this action in the XiaoHui Harness desktop application.',
  'update.action': 'Check and update',
  'update.checking-action': 'Checking…',
  'update.checking': 'Checking for updates. A new release will download and install automatically.',
  'update.shell-unavailable': 'The desktop update service did not respond. Reopen XiaoHui Harness and try again.',
  'update.error': 'Update check failed:',
}
