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
}
